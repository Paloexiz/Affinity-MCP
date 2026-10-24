import { buildProduction } from "./production.mjs";
import { Control, businessWrite, validateReceipt } from "./control.mjs";
import { ApiError, digest, json, reject, exactKeys, objectSha, id, hash, utc, nowUTC } from "./github.mjs";
import { artifactFiles, equal, preflight, readHistoricalCI, validateReview, requiredJobs, requiredName, readInstallations } from "./evidence.mjs";
import { approvalEvidence, executionIdentity, successfulJob, installNames, verifyProduction, verifyReadyDraft, commitMessage, parseProductionMessage, releaseBody, checkDate } from "./publication.mjs";
import { installationToken } from "./app.mjs";
import { checkHistoricalCandidate, git } from "../check-delivery.mjs";

export const recoveryJobs = requiredJobs.map(name => name === "Delivery policy" ? "Recovery policy" : name === requiredName ? "Recovery checks / required" : name.replace(/^test /, "Recovery test "));

const unconfirmedTargets = () => Object.fromEntries(["main", "tag", "release", "assets"].map(name => [name, { status: "unconfirmed" }]));

async function deliveryTargets(api, production, receipt, receiptSha, built, policy) {
  const observed = unconfirmedTargets(); let reading = "main";
  try {
    if (await api.ref("heads/main") !== production) reject("Recovery main no longer equals the exact approved production commit.");
    observed.main = { status: "confirmed", value: production }; reading = "tag";
    const tagName = `v${receipt.version}`, tags = await api.list(`/git/matching-refs/tags/${tagName}`), matches = tags.filter(tag => tag.ref === `refs/tags/${tagName}`);
    if (tags.some(tag => typeof tag.ref !== "string" || !tag.ref.startsWith(`refs/tags/${tagName}`)) || matches.length > 1) reject("Unconfirmed recovery tag collection.");
    let tagSha = null;
    if (matches.length) {
      const ref = matches[0];
      if (ref.object?.type !== "tag") reject("Recovery requires the original annotated tag.");
      const tag = await api.get(`/git/tags/${objectSha(ref.object.sha)}`);
      equal([tag.sha, tag.tag, tag.object?.type, tag.object?.sha], [ref.object.sha, tagName, "commit", production], "Existing tag conflicts with production.");
      equal(parseProductionMessage(tag.message), parseProductionMessage(commitMessage(receipt, receiptSha)), "Existing tag annotation conflicts with receipt.");
      if (tag.tagger?.name !== policy.bot_login || tag.tagger?.email !== `${policy.bot_id}+${policy.bot_login}@users.noreply.github.com`) reject("Existing tag bot identity differs.");
      utc(tag.tagger.date); tagSha = tag.sha;
    }
    observed.tag = { status: "confirmed", value: tagSha }; reading = "release";
    const releases = await api.list("/releases");
    for (const release of releases) { id(release.id); if (typeof release.tag_name !== "string" || typeof release.draft !== "boolean") reject("Unconfirmed recovery Release collection."); }
    const found = releases.filter(release => release.tag_name === tagName);
    if (found.length > 1 || (found.length && !tagSha)) reject("Release exists without the required unique production tag.");
    const release = found[0], assets = [], expectedBody = releaseBody(built.files.find(file => file.path === "CHANGELOG.md").bytes, receipt.version);
    if (release) {
      if (release.target_commitish !== production || release.name !== tagName || release.prerelease !== false || release.body !== expectedBody) reject("Existing Release identity or notes conflict.");
      observed.release = { status: "confirmed", value: { id: release.id, draft: release.draft, immutable: release.immutable === true } }; reading = "assets";
      observed.assets.verified = assets;
      for (const asset of await api.list(`/releases/${release.id}/assets`)) {
        const bytes = built.bundle.get(asset.name);
        if (!bytes || assets.some(value => value.name === asset.name) || asset.state !== "uploaded" || asset.size !== bytes.length) reject("Existing Release assets conflict.");
        if (!(await api.get(`/releases/assets/${id(asset.id)}`, { raw: true })).equals(bytes)) reject("Existing Release asset bytes conflict.");
        assets.push({ id: asset.id, name: asset.name, sha256: digest(bytes), size: bytes.length });
      }
      observed.assets.status = "confirmed"; reading = "release";
      if (!release.draft && (release.immutable !== true || assets.length !== built.bundle.size || (await api.get("/releases/latest")).id !== release.id)) reject("Public Release is incomplete, mutable or not latest; it cannot be repaired automatically.");
    }
    return { main: production, tag: tagSha, release: release ? { id: release.id, draft: release.draft, immutable: release.immutable === true } : null, assets: assets.sort((a,b) => a.name.localeCompare(b.name)), missing_assets: [...built.bundle.keys()].filter(name => !assets.some(asset => asset.name === name)), complete: Boolean(release && !release.draft) };
  } catch (error) {
    observed[reading].status = error instanceof ApiError ? "unconfirmed" : "conflict";
    // Partial observations are diagnostic only; every write still repeats complete discovery.
    error.recovery_targets = observed; throw error;
  }
}

export async function inspectRecovery(api, root, identity, policy) {
  exactKeys(identity, ["source_sha", "base_sha", "production_sha", "receipt_sha", "version", "control_root"]);
  for (const key of ["source_sha", "base_sha", "production_sha", "receipt_sha", "control_root"]) objectSha(identity[key]);
  await preflight(api, policy);
  const reader = new Control(api, identity.control_root), control = await reader.read(), state = control.tip.state;
  if (state.owner || state.intent) reject("Recovery is blocked by an old owner or unresolved intent; reconcile control first.");
  if (state.retired_sources.includes(identity.source_sha)) reject("Retired source conflicts with delivered production; manual investigation is required.");
  const index = control.history.findIndex(entry => entry.sha === identity.receipt_sha), record = control.history[index];
  if (!record || record.state.record.type !== "receipt") reject("Production receipt is not reachable from the pinned control root.");
  const receipt = validateReceipt(record.state.record.data), recipe = control.history[0].state.record.data;
  equal([receipt.source_sha, receipt.production_base_sha, receipt.version, receipt.recipe_version, receipt.recipe_tool_sha], [identity.source_sha, identity.base_sha, identity.version, recipe.recipe_version, recipe.tool_sha], "Recovery identity differs from its durable receipt or recipe.");
  if (receipt.ci.workflow_id !== policy.workflow_id || receipt.ci.check_app_id !== policy.actions_app_id || receipt.ci.workflow_sha !== identity.source_sha) reject("Historical CI identity differs from the approved repository policy.");
  await api.commit(recipe.tool_sha);
  if (git(root, ["rev-parse", "--verify", `${recipe.tool_sha}^{commit}`]) !== recipe.tool_sha || recipe.node_version !== "24.22.1") reject("Original recipe tool or runtime mapping is unavailable.");
  const mainIntent = control.history.findIndex((entry, i) => i > index && entry.state.record.type === "intent" && entry.state.intent?.target === "main" && entry.state.intent.data.before_sha === identity.base_sha && entry.state.intent.data.after_sha === identity.production_sha && digest(json(entry.state.owner)) === digest(json(record.state.owner)));
  const resolution = control.history[mainIntent + 1]?.state.record;
  if (mainIntent < 0 || !((resolution?.type === "result" && resolution.data.outcome === "success") || (resolution?.type === "recover" && resolution.data.resolution === "exact-success"))) reject("Production commit lacks its exact confirmed main write in control history.");
  const built = buildProduction(root, { source: identity.source_sha, base: identity.base_sha });
  for (const key of ["source_sha", "production_base_sha", "version", "release_date", "production_tree_sha", "recipe_version", "manifest_sha256", "archive_sha256"]) equal(built.summary[key], receipt[key], "Rebuilt original recipe differs from receipt.");
  const history = checkHistoricalCandidate(root, identity.source_sha, identity.base_sha, state.retired_sources);
  await verifyProduction(api, identity.production_sha, receipt, identity.receipt_sha, built.files);
  const targets = await deliveryTargets(api, identity.production_sha, receipt, identity.receipt_sha, built, policy);
  try {
    if ((await reader.read()).tip.sha !== control.tip.sha) reject("Control changed during recovery discovery.");
    return { receipt, recipe, history, candidate: built.summary, source_tree: (await api.commit(identity.source_sha)).tree.sha, targets };
  } catch (error) {
    error.recovery_targets = Object.fromEntries(["main", "tag", "release", "assets"].map(name => [name, { status: "confirmed", value: targets[name] }]));
    throw error;
  }
}

export function recoveryProof(api, identity, execution, candidate, recipe, artifact, installations) {
  return { schema_version: 1, repository_id: api.repositoryId, repository: api.repository, ref: "refs/heads/develop", execution, identity, recipe, artifact, installations, production_tree_sha: candidate.production_tree_sha, archive_sha256: candidate.archive_sha256, manifest_sha256: candidate.manifest_sha256, check_set_version: "1", required_jobs: recoveryJobs };
}

async function freshValidation(api, input, state, policy) {
  const { execution } = input;
  if (execution.event !== "workflow_dispatch") reject("Recovery requires a new trusted dispatch run.");
  const jobs = await executionIdentity(api, execution, policy), checked = [];
  const run = await api.get(`/actions/runs/${execution.run_id}/attempts/${execution.run_attempt}`);
  for (const name of [...recoveryJobs, ...installNames]) {
    const summary = successfulJob(jobs, name, execution), job = jobs.find(job => job.id === summary.job_id);
    const prefix = `https://api.github.com${api.path}/check-runs/`;
    if (!job.check_run_url?.startsWith(prefix)) reject("Recovery check URL is not repository-local.");
    const checkId = id(Number(job.check_run_url.slice(prefix.length))), check = await api.get(`/check-runs/${checkId}`);
    if (check.id !== checkId || check.name !== name || check.head_sha !== execution.workflow_sha || check.check_suite?.id !== id(run.check_suite_id) || check.app?.id !== policy.actions_app_id || check.app.slug !== "github-actions" || check.status !== "completed" || check.conclusion !== "success") reject("Fresh recovery checks did not succeed with the reviewed workflow.");
    checked.push({ ...summary, check_id: checkId });
  }
  if (new Set(checked.map(item => item.check_id)).size !== checked.length) reject("Recovery checks reuse an identity.");
  const proof = input.validation;
  if (proof.run_id !== execution.run_id || proof.head_sha !== execution.workflow_sha || proof.name !== `recovery-${input.identity.source_sha}-${execution.run_id}-${execution.run_attempt}`) reject("Recovery validation artifact belongs to another execution.");
  const files = await artifactFiles(api, proof, ["recovery-validation.json"]), expected = recoveryProof(api, input.identity, execution, state.candidate, state.recipe, input.artifact, input.installations);
  if (!files.get("recovery-validation.json").equals(json(expected))) reject("Fresh checks are not bound to the exact historical source/base/production/receipt and recipe.");
  await readInstallations(api, input, state.candidate, jobs);
  return checked;
}

export async function prepareRecoveryHandoff(api, root, input, policy) {
  exactKeys(input, ["identity", "execution", "artifact", "installations", "validation", "review"]);
  const state = await inspectRecovery(api, root, input.identity, policy);
  const checked = await freshValidation(api, input, state, policy);
  // Current attempt jobs and checks are permission canaries before interpreting historical 404/410.
  const originalCI = await readHistoricalCI(api, state.receipt);
  const artifact = input.artifact;
  if (artifact.run_id !== input.execution.run_id || artifact.head_sha !== input.execution.workflow_sha || artifact.name !== `release-${input.identity.source_sha}-${input.execution.run_id}-${input.execution.run_attempt}`) reject("Recovery package belongs to another execution.");
  const built = buildProduction(root, { source: input.identity.source_sha, base: input.identity.base_sha });
  const files = await artifactFiles(api, artifact, [...built.bundle.keys()]);
  for (const [name, bytes] of built.bundle) if (!bytes.equals(files.get(name))) reject("Recovery artifact differs from the original recipe bytes.");
  await validateReview(api, input.review, state.candidate, input.execution);
  return { schema_version: 1, mode: originalCI.status === "available" ? "recovery" : "recovery_revalidation", ...input, ...state, original_ci: originalCI, validation_jobs: checked, policy_sha256: digest(json(policy)) };
}

export async function resumePublication(api, root, handoff, expectedDigest, policy, execution, privateKey, recordApproval = () => {}) {
  if (digest(json(handoff)) !== hash(expectedDigest)) reject("Recovery handoff digest differs.");
  equal(handoff.execution, execution, "Recovery workflow/tool differs from approval.");
  const input = Object.fromEntries(["identity", "execution", "artifact", "installations", "validation", "review"].map(key => [key, handoff[key]]));
  equal(await prepareRecoveryHandoff(api, root, input, policy), handoff, "Recovery facts changed since preparation.");
  if (handoff.targets.complete) return { status: "already-published", identity: input.identity, targets: handoff.targets, mode: handoff.mode };
  const approval = await approvalEvidence(api, handoff, policy);
  await recordApproval(approval);
  const built = buildProduction(root, { source: input.identity.source_sha, base: input.identity.base_sha });
  const credential = await installationToken(api, policy, privateKey); api.writeToken = credential.token;
  const { identity } = input, receipt = handoff.receipt;
  const actor = { run_id: execution.run_id, job_id: approval.job_id, run_attempt: execution.run_attempt, operation: "publish", source_sha: identity.source_sha, version: identity.version, workflow_sha: execution.workflow_sha, tool_sha: execution.tool_sha, token_expires_at: credential.expires_at };
  const control = new Control(api, identity.control_root, actor);
  const targets = async () => { const owned = await control.owned(); if (owned.tip.state.retired_sources.includes(identity.source_sha)) reject("Recovery source is retired."); await api.identity({ writable: true }); return deliveryTargets(api, identity.production_sha, receipt, identity.receipt_sha, built, policy); };
  const send = (target, data, method, path, body, beforeSubmit) => businessWrite(control, { target, data, request_sha256: digest(json({ method, path, body: target === "asset" ? { size: data.size, sha256: data.sha256 } : body })) }, method, path, body, beforeSubmit);
  let result, failure;
  try {
    await control.claim(); equal(await targets(), handoff.targets, "Production targets changed before recovery ownership.");
    equal(await readHistoricalCI(api, receipt), handoff.original_ci, "Historical CI availability changed; prepare and approve again.");
    let state = await targets();
    const tagName = `v${identity.version}`, body = releaseBody(built.files.find(file => file.path === "CHANGELOG.md").bytes, identity.version), bodyHash = digest(Buffer.from(body));
    if (!state.tag) {
      const tagger = { name: policy.bot_login, email: `${policy.bot_id}+${policy.bot_login}@users.noreply.github.com`, date: nowUTC() };
      const tag = await api.request("POST", api.path + "/git/tags", { tag: tagName, message: commitMessage(receipt, identity.receipt_sha), object: identity.production_sha, type: "commit", tagger });
      const read = await api.get(`/git/tags/${objectSha(tag.sha)}`);
      equal([read.tag, read.object?.sha, read.object?.type, read.tagger], [tagName, identity.production_sha, "commit", tagger], "Recovery tag object differs.");
      equal(parseProductionMessage(read.message), parseProductionMessage(commitMessage(receipt, identity.receipt_sha)), "Recovery annotation differs.");
      await send("tag", { tag_name: tagName, object_sha: tag.sha, commit_sha: identity.production_sha }, "POST", "/git/refs", { ref: `refs/tags/${tagName}`, sha: tag.sha }, targets);
    }
    state = await targets();
    if (!state.release) await send("draft", { tag_name: tagName, commit_sha: identity.production_sha, body_sha256: bodyHash }, "POST", "/releases", { tag_name: tagName, target_commitish: identity.production_sha, name: tagName, body, draft: true, prerelease: false }, targets);
    state = await targets(); const releaseId = state.release.id;
    for (const [name, bytes] of built.bundle) {
      state = await targets();
      if (!state.missing_assets.includes(name)) continue;
      await send("asset", { release_id: releaseId, name, size: bytes.length, sha256: digest(bytes) }, "POST", `/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, bytes, targets);
    }
    state = await targets();
    if (state.missing_assets.length) reject("Recovery bundle is incomplete.");
    if (state.release.draft) await send("publish", { release_id: releaseId, tag_name: tagName, commit_sha: identity.production_sha, body_sha256: bodyHash }, "PATCH", `/releases/${releaseId}`, { draft: false, prerelease: false, make_latest: "true" }, async () => { await targets(); await verifyReadyDraft(api, releaseId, built, identity.production_sha, state.tag, body); checkDate(receipt.release_date, { first: false }); });
    state = await targets(); if (!state.complete) reject("Recovery publication is not confirmed complete.");
    await control.finish("complete"); result = { status: "published", identity, mode: handoff.mode, targets: state, approval, control_sha: control.current.tip.sha };
  } catch (error) {
    failure = error;
    if (control.held && !control.closed && !control.current.tip.state.intent) { try { await control.finish("rejected"); } catch { /* Keep uncertain state for explicit control recovery. */ } }
  } finally {
    api.writeToken = undefined;
    try { await credential.revoke(); } catch { failure ??= new Error("Recovery token revocation is unconfirmed; read back state."); }
  }
  if (failure) throw failure;
  return result;
}

export async function recoveryReport(api, root, identity, policy) {
  try { return { status: "verified", identity, ...(await inspectRecovery(api, root, identity, policy)) }; }
  catch (error) {
    return { status: "blocked", identity, targets: error.recovery_targets ?? unconfirmedTargets(), reason: error.message, retry: error instanceof ApiError && (error.status === null || error.status >= 500) ? "read-only-discovery" : "resolve-before-retry" };
  }
}
