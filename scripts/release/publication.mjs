import { createHash } from "node:crypto";
import { buildProduction } from "./production.mjs";
import { Control, businessWrite, unissuedTargets, validateReceipt } from "./control.mjs";
import { digest, json, reject, exactKeys, objectSha, hash, id, utc, nowUTC } from "./github.mjs";
import { equal, preflight, readPushCI, artifactFiles, validateReview, workflowPath, installNames, readInstallations } from "./evidence.mjs";
import { installationToken } from "./app.mjs";
import { parseVersion } from "../check-version.mjs";

export const daySafetyMs = 120000; // Four 30-second request budgets; a late response still requires explicit cross-day detection.
const trailerKeys = { Version: "version", "Release-Date": "release_date", "Source-Commit": "source_sha", "Production-Base": "production_base_sha", "Production-Tree": "production_tree_sha", "Recipe-Version": "recipe_version", "Recipe-Tool-Commit": "recipe_tool_sha", "Manifest-SHA256": "manifest_sha256", "Archive-SHA256": "archive_sha256", "CI-Evidence-Commit": "receipt_sha" };
export { installNames } from "./evidence.mjs";

export function checkDate(date, { first = true, window = true } = {}) {
  utc(`${date}T00:00:00Z`);
  const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
  if (first && today !== date) reject("First publication date differs from current UTC day.");
  if (window && Date.parse(`${today}T00:00:00Z`) + 86400000 - now <= daySafetyMs) reject("Publication is inside the UTC boundary safety window.");
  return today;
}

export function releaseBody(bytes, version) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).replaceAll("\r\n", "\n");
  const lines = text.split("\n"), starts = lines.flatMap((line, i) => line === `### ${version}` ? [i] : []);
  if (starts.length !== 1) reject("Release notes need exactly one current English entry.");
  const start = starts[0] + 1, next = lines.findIndex((line, i) => i >= start && /^#{1,3} /.test(line));
  const body = lines.slice(start, next === -1 ? lines.length : next).join("\n").trim();
  if (!body) reject("Current release entry must contain user changes or the documented no-change sentence.");
  return body + "\n";
}

export function commitMessage(receipt, receiptSha) {
  validateReceipt(receipt); objectSha(receiptSha);
  const values = { ...receipt, receipt_sha: receiptSha };
  return `Release ${receipt.version}\n\n` + Object.entries(trailerKeys).map(([key, field]) => `${key}: ${values[field]}\n`).join("");
}
export function parseProductionMessage(message) {
  if (typeof message !== "string") reject("Production message is missing.");
  const lines = message.replace(/\n$/, "").split("\n");
  if (lines.length !== Object.keys(trailerKeys).length + 2 || lines[1] !== "") reject("Production trailers are incomplete or duplicated.");
  const result = {};
  for (const [i, [key, field]] of Object.entries(trailerKeys).entries()) {
    if (!lines[i + 2].startsWith(`${key}: `)) reject("Production trailer keys or order differ.");
    result[field] = lines[i + 2].slice(key.length + 2);
  }
  if (lines[0] !== `Release ${result.version}` || !/^\d+\.\d+\.\d+$/.test(result.version) || result.recipe_version !== "1") reject("Production version or recipe is invalid.");
  parseVersion(result.version, "stable");
  utc(`${result.release_date}T00:00:00Z`);
  for (const key of ["source_sha", "production_base_sha", "production_tree_sha", "recipe_tool_sha", "receipt_sha"]) objectSha(result[key]);
  hash(result.manifest_sha256); hash(result.archive_sha256); return result;
}

export async function executionIdentity(api, execution, policy) {
  exactKeys(execution, ["run_id", "run_attempt", "workflow_sha", "tool_sha", "event"]);
  id(execution.run_id); id(execution.run_attempt); objectSha(execution.workflow_sha); objectSha(execution.tool_sha);
  if (!["push", "workflow_dispatch"].includes(execution.event) || execution.workflow_sha !== execution.tool_sha) reject("Publication tool must be the trusted run checkout.");
  const run = await api.get(`/actions/runs/${execution.run_id}/attempts/${execution.run_attempt}`);
  if (run.id !== execution.run_id || run.run_attempt !== execution.run_attempt || run.repository?.id !== api.repositoryId || run.head_repository?.id !== api.repositoryId || run.head_branch !== "develop" || run.head_sha !== execution.workflow_sha || run.event !== execution.event || run.workflow_id !== policy.workflow_id || ![workflowPath, `${workflowPath}@develop`, `${workflowPath}@refs/heads/develop`].includes(run.path)) reject("Publication execution identity differs.");
  return api.jobs(execution.run_id, execution.run_attempt);
}
export function successfulJob(jobs, name, execution) {
  const matches = jobs.filter(job => job.name === name);
  if (matches.length !== 1 || matches[0].head_sha !== execution.workflow_sha || matches[0].status !== "completed" || matches[0].conclusion !== "success") reject("Publication dependency did not succeed in the exact attempt.");
  return { name, job_id: id(matches[0].id), completed_at: utc(matches[0].completed_at) };
}

export async function prepareHandoff(api, root, input, policy) {
  exactKeys(input, ["source_sha", "base_sha", "control_root", "original_ci", "execution", "artifact", "installations", "review"]);
  const { source_sha: source, base_sha: base, execution, original_ci: original } = input;
  objectSha(source); objectSha(base); objectSha(input.control_root);
  await preflight(api, policy);
  const jobs = await executionIdentity(api, execution, policy);
  const control = await new Control(api, input.control_root).read();
  if (control.tip.state.owner || control.tip.state.intent || control.tip.state.retired_sources.includes(source)) reject("Candidate has no current publication eligibility.");
  const recipeTool = control.history[0].state.record.data.tool_sha;
  equal([original.source_sha, original.recipe_tool_sha, original.workflow_id, original.actions_app_id], [source, recipeTool, policy.workflow_id, policy.actions_app_id], "Original CI inputs differ from source, recipe or policy.");
  const built = buildProduction(root, { source, base }), candidate = built.summary;
  checkDate(candidate.release_date);
  if (await api.ref("heads/develop") !== source) reject("First publication source must be current develop.");
  await unissuedTargets(api, candidate.version, base);
  const releases = await api.list("/releases");
  if (releases.some(release => release.tag_name === `v${candidate.version}`)) reject("Unexpected pre-existing Release before first main publication.");
  const ci = await readPushCI(api, original);
  const binding = input.artifact;
  if (binding.run_id !== execution.run_id || binding.head_sha !== execution.workflow_sha || binding.name !== `release-${source}-${execution.run_id}-${execution.run_attempt}`) reject("Package artifact belongs to another preparation.");
  const files = await artifactFiles(api, binding, [...built.bundle.keys()]);
  for (const [name, bytes] of built.bundle) if (!bytes.equals(files.get(name))) reject("Package differs from the frozen source and recipe.");
  const installation = await readInstallations(api, input, candidate, jobs);
  await validateReview(api, input.review, candidate, execution);
  const receipt = Object.fromEntries(["source_sha", "production_base_sha", "version", "release_date", "production_tree_sha", "recipe_version"].map(key => [key, candidate[key]]));
  Object.assign(receipt, { recipe_tool_sha: recipeTool, manifest_sha256: candidate.manifest_sha256, archive_sha256: candidate.archive_sha256, ci }); validateReceipt(receipt);
  return { schema_version: 1, mode: "publish", control_root: input.control_root, candidate, source_tree: (await api.commit(source)).tree.sha, execution, artifact: binding, installations: input.installations, original_ci: original, receipt, review: input.review, installation, release_body: releaseBody(built.files.find(file => file.path === "CHANGELOG.md").bytes, candidate.version), policy_sha256: digest(json(policy)) };
}

export async function approvalEvidence(api, handoff, policy) {
  const jobs = await executionIdentity(api, handoff.execution, policy);
  const controlJob = { "retire-candidate": "Retire candidate", "control-recover": "Recover release control" }[handoff.mode];
  if (!controlJob && !["publish", "recovery", "recovery_revalidation"].includes(handoff.mode)) reject("Unknown protected operation.");
  for (const name of controlJob ? ["Control approval summary"] : [...installNames, "Prepare release", "Release approval summary"]) successfulJob(jobs, name, handoff.execution);
  const matches = jobs.filter(job => job.name === (controlJob ?? "Publish release"));
  if (matches.length !== 1 || matches[0].status !== "in_progress" || matches[0].head_sha !== handoff.execution.workflow_sha) reject("Protected publication job identity is not confirmed.");
  const history = await api.get(`/actions/runs/${handoff.execution.run_id}/approvals`);
  if (!Array.isArray(history)) reject("Platform approval history is unavailable.");
  const approved = history.filter(entry => entry.state === "approved" && policy.reviewer_ids.includes(entry.user?.id) && entry.environments?.some(env => env.id === policy.environment_id && env.name === "production"));
  if (!approved.length) reject("No production reviewer approval is recorded for this run.");
  // The API has no attempt/job/hash fields: the protected job and same-run outputs supply that binding, not comments.
  return { run_id: handoff.execution.run_id, run_attempt: handoff.execution.run_attempt, job_id: matches[0].id, handoff_sha256: digest(json(handoff)), reviewers: [...new Set(approved.map(entry => entry.user.id))], observed_at: nowUTC(), source: "environment-job-and-same-run-outputs" };
}

export async function verifyProduction(api, production, receipt, receiptSha, files) {
  const commit = await api.commit(production);
  equal(commit.parents.map(parent => parent.sha), [receipt.production_base_sha], "Production parent differs.");
  equal(commit.tree.sha, receipt.production_tree_sha, "Production tree differs.");
  equal(parseProductionMessage(commit.message), parseProductionMessage(commitMessage(receipt, receiptSha)), "Production trailers differ from the receipt.");
  const entries = (await api.tree(commit.tree.sha, true)).filter(entry => entry.type !== "tree");
  equal(entries.map(({ path, mode, type }) => ({ path, mode, type })).sort((a,b) => a.path.localeCompare(b.path)), files.map(({ path, mode }) => ({ path, mode, type: "blob" })).sort((a,b) => a.path.localeCompare(b.path)), "Production file set differs.");
  for (const entry of entries) if (!(await api.blob(entry.sha)).equals(files.find(file => file.path === entry.path).bytes)) reject("Production file bytes differ.");
  return commit;
}

async function createProduction(api, files, receipt, receiptSha, bot) {
  const tree = [];
  for (const file of files) {
    const blob = await api.request("POST", api.path + "/git/blobs", { content: file.bytes.toString("base64"), encoding: "base64" });
    const expected = createHash("sha1").update(`blob ${file.bytes.length}\0`).update(file.bytes).digest("hex");
    equal(blob.sha, expected, "Uploaded Git blob identity differs."); tree.push({ path: file.path, mode: file.mode, type: "blob", sha: blob.sha });
  }
  const created = await api.request("POST", api.path + "/git/trees", { tree });
  equal(created.sha, receipt.production_tree_sha, "Uploaded production tree differs.");
  const author = { ...bot, date: nowUTC() };
  const commit = await api.request("POST", api.path + "/git/commits", { message: commitMessage(receipt, receiptSha), tree: created.sha, parents: [receipt.production_base_sha], author, committer: author });
  const sha = objectSha(commit.sha), read = await verifyProduction(api, sha, receipt, receiptSha, files);
  for (const key of ["author", "committer"]) equal(read[key], author, "Production bot identity or UTC date differs.");
  return sha;
}

export async function verifyAssets(api, releaseId, built) {
  const assets = await api.list(`/releases/${id(releaseId)}/assets`);
  equal(assets.map(value => value.name).sort(), [...built.bundle.keys()].sort(), "Release asset set differs.");
  for (const asset of assets) {
    const expected = built.bundle.get(asset.name);
    if (asset.state !== "uploaded" || asset.size !== expected.length || !(await api.get(`/releases/assets/${id(asset.id)}`, { raw: true })).equals(expected)) reject("Downloaded Release asset differs from the approved source/ZIP/manifest/tree.");
  }
}

export async function verifyReadyDraft(api, releaseId, built, production, tag, body) {
  const release = await api.get(`/releases/${id(releaseId)}`), name = `v${built.summary.version}`;
  equal([release.id, release.tag_name, release.name, release.target_commitish, release.body, release.draft, release.prerelease], [releaseId, name, name, production, body, true, false], "Draft identity or contents changed before publication.");
  await verifyAssets(api, releaseId, built);
  if (await api.ref("heads/main") !== production || await api.ref(`tags/${name}`) !== tag) reject("Production targets changed before publication.");
}

export async function publish(api, root, handoff, expectedDigest, policy, execution, privateKey, recordApproval = () => {}) {
  if (digest(json(handoff)) !== hash(expectedDigest)) reject("Same-run handoff digest differs.");
  equal(handoff.execution, execution, "Approved workflow/tool execution changed.");
  const input = { source_sha: handoff.candidate.source_sha, base_sha: handoff.candidate.production_base_sha, control_root: handoff.control_root, original_ci: handoff.original_ci, execution, artifact: handoff.artifact, installations: handoff.installations, review: handoff.review };
  equal(await prepareHandoff(api, root, input, policy), handoff, "Approved handoff differs from current verification.");
  const approval = await approvalEvidence(api, handoff, policy);
  await recordApproval(approval);
  const built = buildProduction(root, { source: input.source_sha, base: input.base_sha });
  const credential = await installationToken(api, policy, privateKey);
  api.writeToken = credential.token;
  const actor = { run_id: execution.run_id, job_id: approval.job_id, run_attempt: execution.run_attempt, operation: "publish", source_sha: input.source_sha, version: built.summary.version, workflow_sha: execution.workflow_sha, tool_sha: execution.tool_sha, token_expires_at: credential.expires_at };
  const control = new Control(api, handoff.control_root, actor), bot = { name: policy.bot_login, email: `${policy.bot_id}+${policy.bot_login}@users.noreply.github.com` };
  const send = async (target, data, method, path, body, beforeSubmit) => businessWrite(control, { target, data, request_sha256: digest(json({ method, path, body: target === "asset" ? { size: data.size, sha256: data.sha256 } : body })) }, method, path, body, beforeSubmit);
  let result, failure, production, mainConfirmedOnDate = false;
  try {
    await control.claim();
    const firstConditions = async () => {
      await control.owned(); await api.identity({ writable: true });
      if (control.current.tip.state.retired_sources.includes(input.source_sha) || await api.ref("heads/develop") !== input.source_sha) reject("Candidate lost first-publication eligibility.");
      await unissuedTargets(api, actor.version, input.base_sha);
      equal(await readPushCI(api, handoff.original_ci), handoff.receipt.ci, "Original push CI differs from the approved receipt.");
      checkDate(built.summary.release_date);
    };
    await firstConditions();
    const receiptSha = await control.receipt(handoff.receipt);
    production = await createProduction(api, built.files, handoff.receipt, receiptSha, bot);
    await firstConditions();
    await send("main", { before_sha: input.base_sha, after_sha: production }, "PATCH", "/git/refs/heads/main", { sha: production, force: false }, () => checkDate(built.summary.release_date));
    if (nowUTC().slice(0, 10) !== built.summary.release_date) reject("First delivery crossed UTC day; delivered content is frozen and subsequent writes stopped.");
    mainConfirmedOnDate = true;
    await verifyProduction(api, production, handoff.receipt, receiptSha, built.files);
    const tagName = `v${actor.version}`, tagger = { ...bot, date: nowUTC() };
    const tag = await api.request("POST", api.path + "/git/tags", { tag: tagName, message: commitMessage(handoff.receipt, receiptSha), object: production, type: "commit", tagger });
    const tagObject = await api.get(`/git/tags/${objectSha(tag.sha)}`);
    equal([tagObject.tag, tagObject.object?.type, tagObject.object?.sha, tagObject.tagger], [tagName, "commit", production, tagger], "Annotated tag identity differs.");
    equal(parseProductionMessage(tagObject.message), parseProductionMessage(commitMessage(handoff.receipt, receiptSha)), "Tag annotation differs.");
    await send("tag", { tag_name: tagName, object_sha: tag.sha, commit_sha: production }, "POST", "/git/refs", { ref: `refs/tags/${tagName}`, sha: tag.sha });
    const bodyHash = digest(Buffer.from(handoff.release_body));
    const draft = await send("draft", { tag_name: tagName, commit_sha: production, body_sha256: bodyHash }, "POST", "/releases", { tag_name: tagName, target_commitish: production, name: tagName, body: handoff.release_body, draft: true, prerelease: false });
    const releaseId = draft.observed.release_id;
    for (const [name, bytes] of built.bundle) await send("asset", { release_id: releaseId, name, size: bytes.length, sha256: digest(bytes) }, "POST", `/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, bytes);
    await verifyAssets(api, releaseId, built);
    await verifyProduction(api, production, handoff.receipt, receiptSha, built.files);
    if (await api.ref("heads/main") !== production || await api.ref(`tags/${tagName}`) !== tag.sha) reject("Production targets changed before publication.");
    await send("publish", { release_id: releaseId, tag_name: tagName, commit_sha: production, body_sha256: bodyHash }, "PATCH", `/releases/${releaseId}`, { draft: false, prerelease: false, make_latest: "true" }, async () => { await verifyReadyDraft(api, releaseId, built, production, tag.sha, handoff.release_body); checkDate(built.summary.release_date, { first: false }); });
    await verifyAssets(api, releaseId, built); await control.finish("complete");
    result = { status: "published", source_sha: input.source_sha, production_sha: production, receipt_sha: receiptSha, tag_sha: tag.sha, release_id: releaseId, approval, control_sha: control.current.tip.sha };
  } catch (error) {
    failure = error;
    if (production && !mainConfirmedOnDate && nowUTC().slice(0, 10) !== built.summary.release_date) {
      try { if (await api.ref("heads/main") === production) failure = new Error("First delivery crossed UTC day; delivered content is frozen and subsequent writes stopped. Control state must be read back."); }
      catch { /* Unknown read-back retains the original failure and durable intent. */ }
    }
    // A partial delivery is kept for a new reviewed run; never turn an unresolved intent into idle.
    if (control.held && !control.closed && !control.current.tip.state.intent) {
      try { await control.finish("rejected"); } catch { /* Preserve ownership when final state cannot be confirmed. */ }
    }
  } finally {
    api.writeToken = undefined;
    try { await credential.revoke(); } catch { failure ??= new Error("Publication state must be read back; current token revocation is unconfirmed."); }
  }
  if (failure) throw failure;
  return result;
}
