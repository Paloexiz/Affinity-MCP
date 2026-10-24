import { isDeepStrictEqual } from "node:util";
import { ApiError, digest, json, exactKeys, reject, id, objectSha, hash, utc } from "./github.mjs";
import { unpackTransport } from "./transport.mjs";

export const workflowPath = ".github/workflows/docs-hooks.yml";
export const requiredName = "Repository checks / required";
export const requiredJobs = ["test (windows-latest, Node 24.22.1)", "test (macos-latest, Node 24.22.1)", "test (ubuntu-latest, Node 24.22.1)", "test (ubuntu-latest, Node 24.20.0)", "Delivery policy", requiredName];
export const installPlatforms = ["windows-latest", "macos-latest", "ubuntu-latest"];
export const installNames = installPlatforms.map(platform => `Install archive (${platform})`);
export const equal = (a, b, message) => { if (!isDeepStrictEqual(a, b)) reject(message); };

export async function artifactFiles(api, binding, names) {
  exactKeys(binding, ["id", "digest", "name", "run_id", "head_sha"]);
  id(binding.id); id(binding.run_id); hash(binding.digest); objectSha(binding.head_sha);
  const artifact = await api.get(`/actions/artifacts/${binding.id}`);
  const run = artifact.workflow_run;
  if (artifact.id !== binding.id || artifact.name !== binding.name || artifact.expired !== false || artifact.digest !== `sha256:${binding.digest}` || run?.id !== binding.run_id || run.repository_id !== api.repositoryId || run.head_repository_id !== api.repositoryId || run.head_branch !== "develop" || run.head_sha !== binding.head_sha) reject("Artifact identity differs from the approved handoff.");
  const bytes = await api.get(`/actions/artifacts/${binding.id}/zip`, { raw: true, artifact: true });
  if (bytes.length !== artifact.size_in_bytes || digest(bytes) !== binding.digest) reject("Artifact transport digest differs.");
  return unpackTransport(bytes, names);
}

export function installationProof(api, execution, artifact, candidate, platform, jobId) {
  if (!installPlatforms.includes(platform)) reject("Unknown installation platform.");
  return { schema_version: 1, repository_id: api.repositoryId, repository: api.repository, execution, platform, job_id: id(jobId), artifact, source_sha: candidate.source_sha, production_base_sha: candidate.production_base_sha, production_tree_sha: candidate.production_tree_sha, archive_sha256: candidate.archive_sha256, manifest_sha256: candidate.manifest_sha256 };
}

export async function readInstallations(api, input, candidate, jobs) {
  const { execution, artifact, installations } = input;
  if (!Array.isArray(installations) || installations.length !== installPlatforms.length || new Set(installations.map(value => value?.id)).size !== installPlatforms.length) reject("Three distinct installation receipts are required.");
  const results = [];
  for (const [i, platform] of installPlatforms.entries()) {
    const matches = jobs.filter(job => job.name === installNames[i]);
    if (matches.length !== 1 || matches[0].head_sha !== execution.workflow_sha || matches[0].status !== "completed" || matches[0].conclusion !== "success") reject("Installation job did not succeed in the exact attempt.");
    const job = matches[0], binding = installations[i];
    if (binding.run_id !== execution.run_id || binding.head_sha !== execution.workflow_sha || binding.name !== `installation-${candidate.source_sha}-${execution.run_id}-${execution.run_attempt}-${platform}`) reject("Installation receipt belongs to another execution or platform.");
    const files = await artifactFiles(api, binding, ["installation.json"]), expected = installationProof(api, execution, artifact, candidate, platform, job.id);
    if (!files.get("installation.json").equals(json(expected))) reject("Installation receipt does not bind the consumed artifact and source/package hashes.");
    results.push({ name: job.name, job_id: id(job.id), completed_at: utc(job.completed_at), receipt: binding });
  }
  return results;
}

async function pushChecks(api, input, stored) {
  exactKeys(input, ["source_sha", "run_id", "run_attempt", "ref_artifact_id", "ref_artifact_digest", "workflow_id", "actions_app_id", "recipe_tool_sha"]);
  for (const key of ["run_id", "run_attempt", "ref_artifact_id", "workflow_id", "actions_app_id"]) id(input[key]);
  objectSha(input.source_sha); objectSha(input.recipe_tool_sha); hash(input.ref_artifact_digest);
  await api.identity();
  const unavailable = [];
  const read = async (path, action) => {
    try { return await action(); } catch (error) {
      if (!stored || !(error instanceof ApiError) || ![404, 410].includes(error.status)) throw error;
      unavailable.push({ path, status: error.status }); return null;
    }
  };
  const runPath = `/actions/runs/${input.run_id}/attempts/${input.run_attempt}`;
  const run = await read(runPath, () => api.get(runPath));
  if (run && (run.id !== input.run_id || run.run_attempt !== input.run_attempt || run.repository?.id !== api.repositoryId || run.head_repository?.id !== api.repositoryId || run.workflow_id !== input.workflow_id || run.event !== "push" || run.head_branch !== "develop" || run.head_sha !== input.source_sha || ![workflowPath, `${workflowPath}@refs/heads/develop`, `${workflowPath}@develop`].includes(run.path))) reject("Exact original push attempt identity differs.");
  const workflow = await api.get(`/actions/workflows/${input.workflow_id}`);
  if (workflow.id !== input.workflow_id || workflow.path !== workflowPath || workflow.state !== "active") reject("Required workflow identity differs.");
  const workflowBlob = async sha => {
    const entries = await api.tree((await api.commit(sha)).tree.sha, true), entry = entries.find(file => file.path === workflowPath);
    if (entry?.mode !== "100644" || entry.type !== "blob") reject("Required workflow blob is unavailable.");
    return objectSha(entry.sha);
  };
  equal(await workflowBlob(input.source_sha), await workflowBlob(input.recipe_tool_sha), "Original workflow differs from the reviewed check-set recipe.");
  const jobs = await read(runPath + "/jobs", () => api.jobs(input.run_id, input.run_attempt)), checks = [];
  for (const name of jobs ? requiredJobs : []) {
    const matches = jobs.filter(job => job.name === name);
    if (matches.length !== 1) reject("Required attempt job is missing or duplicated.");
    const job = matches[0];
    if (job.head_sha !== input.source_sha || job.head_branch !== "develop" || job.status !== "completed" || job.conclusion !== "success") reject("Required attempt job did not succeed.");
    const match = new RegExp(`^https://api\\.github\\.com/repos/${api.repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/check-runs/([1-9]\\d*)$`).exec(job.check_run_url);
    if (!match) reject("Job check identity is not repository-local.");
    if (stored && name === requiredName && (job.id !== stored.job_id || Number(match[1]) !== stored.check_id)) reject("Historical attempt contradicts the durable receipt.");
    const check = await read(`/check-runs/${match[1]}`, () => api.get(`/check-runs/${id(Number(match[1]))}`));
    if (!check) continue;
    if (check.id !== Number(match[1]) || check.name !== name || check.head_sha !== input.source_sha || (run && check.check_suite?.id !== id(run.check_suite_id)) || check.app?.id !== input.actions_app_id || check.app.slug !== "github-actions" || check.status !== "completed" || check.conclusion !== "success") reject("Required check identity or result differs.");
    utc(job.completed_at); utc(check.completed_at);
    checks.push({ job, check });
  }
  if (new Set(checks.map(({ check }) => check.id)).size !== checks.length) reject("Checks are reused across required jobs.");
  if (stored) {
    const aggregate = await read(`/check-runs/${stored.check_id}`, () => api.get(`/check-runs/${stored.check_id}`));
    if (aggregate && (aggregate.id !== stored.check_id || aggregate.name !== stored.check_name || aggregate.head_sha !== stored.head_sha || (run && aggregate.check_suite?.id !== run.check_suite_id) || aggregate.app?.id !== stored.check_app_id || aggregate.app.slug !== "github-actions" || aggregate.status !== "completed" || aggregate.conclusion !== "success" || aggregate.completed_at !== stored.completed_at)) reject("Historical aggregate contradicts its durable receipt.");
    const found = checks.find(({job}) => job.name === requiredName);
    if (found && (found.job.id !== stored.job_id || found.check.id !== stored.check_id || found.check.completed_at !== stored.completed_at)) reject("Historical attempt contradicts the durable receipt.");
  }
  return { run, checks, unavailable };
}

export async function readHistoricalCI(api, receipt) {
  const ci = receipt.ci;
  const input = { source_sha: receipt.source_sha, run_id: ci.run_id, run_attempt: ci.run_attempt, ref_artifact_id: ci.ref_evidence.artifact_id, ref_artifact_digest: ci.ref_evidence.artifact_digest, workflow_id: ci.workflow_id, actions_app_id: ci.check_app_id, recipe_tool_sha: receipt.recipe_tool_sha };
  const { unavailable } = await pushChecks(api, input, ci);
  return { status: unavailable.length ? "unavailable" : "available", unavailable };
}

export async function readPushCI(api, input) {
  const { run, checks } = await pushChecks(api, input);
  const binding = { id: input.ref_artifact_id, digest: input.ref_artifact_digest, name: `push-ref-${input.source_sha}-${input.run_id}-${input.run_attempt}`, run_id: input.run_id, head_sha: input.source_sha };
  const files = await artifactFiles(api, binding, ["push-ref.json"]), bytes = files.get("push-ref.json");
  let proof; try { proof = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes)); } catch { reject("Original ref proof is invalid."); }
  const expected = { schema_version: 1, repository_id: api.repositoryId, repository: api.repository, workflow_ref: `${api.repository}/${workflowPath}@refs/heads/develop`, workflow_sha: input.source_sha, ref: "refs/heads/develop", head_sha: input.source_sha, event: "push", run_id: input.run_id, run_attempt: input.run_attempt, check_set_version: "1" };
  equal(proof, expected, "Original full-ref proof differs from the exact push attempt.");
  if (!json(proof).equals(bytes)) reject("Original ref proof must be canonical JSON.");
  const { job, check } = checks.find(({ job }) => job.name === requiredName);
  return { repository_id: api.repositoryId, workflow_id: input.workflow_id, workflow_path: workflowPath, workflow_sha: proof.workflow_sha, ref: proof.ref, head_branch: run.head_branch, head_sha: run.head_sha, event: run.event, run_id: run.id, run_attempt: run.run_attempt, job_id: job.id, check_id: check.id, check_name: check.name, check_app_id: check.app.id, completed_at: check.completed_at, check_set_version: "1", ref_evidence: { run_id: run.id, run_attempt: run.run_attempt, artifact_id: binding.id, artifact_digest: binding.digest } };
}

async function reviewIdentity(api, review, execution) {
  objectSha(review.tool_commit); objectSha(review.tool_tree); hash(review.report_sha256);
  utc(review.reviewed_at);
  if (Date.parse(review.reviewed_at) > Date.now() || review.verdict !== "pass" || !["agent", "human"].includes(review.subject_type) || typeof review.subject_id !== "string" || !/^[\w./@-]{1,160}$/.test(review.subject_id)) reject("Independent review identity or verdict is invalid.");
  equal([review.tool_commit, review.tool_tree], [execution.tool_sha, (await api.commit(execution.tool_sha)).tree.sha], "Review tool identity differs.");
}

export async function validateControlReview(api, review, execution) {
  exactKeys(review, "tool_commit tool_tree scope verdict subject_type subject_id reviewed_at report_sha256".split(" "));
  await reviewIdentity(api, review, execution);
  equal(review.scope, ["workflow", "release-tool", "control-protocol"], "Control review scope is incomplete.");
  return review;
}

export async function validateReview(api, review, candidate, execution) {
  exactKeys(review, "source_commit source_tree tool_commit tool_tree recipe_version archive_sha256 manifest_sha256 scope verdict subject_type subject_id reviewed_at report_sha256".split(" "));
  for (const key of ["source_commit", "source_tree"]) objectSha(review[key]);
  for (const key of ["archive_sha256", "manifest_sha256"]) hash(review[key]);
  await reviewIdentity(api, review, execution);
  equal(review.scope, ["source", "production-transform", "workflow", "release-tool", "user-docs"], "Independent review scope is incomplete.");
  equal([review.recipe_version, review.archive_sha256, review.manifest_sha256], [candidate.recipe_version, candidate.archive_sha256, candidate.manifest_sha256], "Review does not bind this exact package.");
  equal((await api.commit(candidate.source_sha)).tree.sha, review.source_tree, "Review source tree differs.");
  equal((await api.commit(review.source_commit)).tree.sha, review.source_tree, "Reviewed commit does not prove the reviewed tree.");
  return review;
}

export async function preflight(api, policy) {
  exactKeys(policy, "environment_id reviewer_ids workflow_id actions_app_id app_id installation_id bot_id bot_login rulesets activation_sha256".split(" "));
  for (const key of ["environment_id", "workflow_id", "actions_app_id", "app_id", "installation_id", "bot_id"]) id(policy[key]);
  hash(policy.activation_sha256);
  if (!/^[a-z\d-]+\[bot\]$/i.test(policy.bot_login ?? "") || !Array.isArray(policy.reviewer_ids) || !policy.reviewer_ids.length || new Set(policy.reviewer_ids).size !== policy.reviewer_ids.length) reject("Invalid activation identity.");
  policy.reviewer_ids.forEach(id);
  const repo = await api.identity({ writable: true }), blind = ["administrator-bypass-ui", "app-installation-complete-scope", "immutable-releases-setting", "recovery-entry-live-test"];
  if (["allow_merge_commit", "allow_rebase_merge", "allow_squash_merge"].every(key => Object.hasOwn(repo, key))) equal([repo.allow_merge_commit, repo.allow_rebase_merge, repo.allow_squash_merge], [false, false, true], "Repository must be squash-only.");
  else blind.push("merge-settings");
  const environment = await api.get("/environments/production");
  if (environment.id !== policy.environment_id || environment.name !== "production") reject("Pre-existing production environment identity differs.");
  if (Object.hasOwn(environment, "can_admins_bypass") && environment.can_admins_bypass !== false) reject("Environment administrator bypass is enabled.");
  equal(environment.deployment_branch_policy, { protected_branches: false, custom_branch_policies: true }, "Environment must select only develop.");
  const rules = environment.protection_rules?.filter(rule => rule.type === "required_reviewers");
  if (rules?.length !== 1 || rules[0].prevent_self_review !== false || !Array.isArray(rules[0].reviewers) || rules[0].reviewers.some(value => value.type !== "User")) reject("Environment reviewer protection differs.");
  equal(rules[0].reviewers.map(value => id(value.reviewer?.id)).sort((a,b) => a-b), [...policy.reviewer_ids].sort((a,b) => a-b), "Environment reviewers differ.");
  const branches = await api.collection("/environments/production/deployment-branch-policies", "branch_policies");
  equal(branches.map(({ name, type }) => ({ name, type })), [{ name: "develop", type: "branch" }], "Environment branch policy differs.");
  exactKeys(policy.rulesets, ["develop", "mainUpdate", "mainSafety", "tagCreate", "tagSafety", "controlUpdate", "controlSafety"]);
  if (new Set(Object.values(policy.rulesets)).size !== 7) reject("Independent protection rulesets are required.");
  const expected = {
    develop: ["branch", "refs/heads/develop", ["pull_request", "required_status_checks", "required_linear_history", "non_fast_forward", "deletion"], false],
    mainUpdate: ["branch", "refs/heads/main", ["update"], true], mainSafety: ["branch", "refs/heads/main", ["non_fast_forward", "deletion"], false],
    tagCreate: ["tag", "refs/tags/v*", ["creation"], true], tagSafety: ["tag", "refs/tags/v*", ["update", "deletion"], false],
    controlUpdate: ["branch", "refs/heads/release-control", ["creation", "update"], true], controlSafety: ["branch", "refs/heads/release-control", ["non_fast_forward", "deletion"], false],
  };
  for (const [key, [target, ref, types, appBypass]] of Object.entries(expected)) {
    const rule = await api.get(`/rulesets/${id(policy.rulesets[key])}`);
    if (rule.id !== policy.rulesets[key] || rule.source_type !== "Repository" || rule.source?.toLowerCase() !== api.repository.toLowerCase() || rule.enforcement !== "active" || rule.target !== target) reject("Active repository ruleset identity differs.");
    equal(rule.conditions, { ref_name: { include: [ref], exclude: [] } }, "Ruleset target differs.");
    if (!Array.isArray(rule.rules) || new Set(rule.rules.map(value => value.type)).size !== rule.rules.length || types.some(type => !rule.rules.some(value => value.type === type))) reject("Required protection rule is missing.");
    if (Object.hasOwn(rule, "bypass_actors")) equal(rule.bypass_actors, appBypass ? [{ actor_id: policy.app_id, actor_type: "Integration", bypass_mode: "always" }] : [], "Ruleset bypass differs.");
    else blind.push(`bypass:${key}`);
    if (key === "develop") {
      const checks = rule.rules.find(value => value.type === "required_status_checks").parameters;
      if (checks?.strict_required_status_checks_policy !== true || !checks.required_status_checks?.some(value => value.context === requiredName && value.integration_id === policy.actions_app_id)) reject("Exact strict required check is missing.");
    }
  }
  return { environment_id: environment.id, activation_sha256: policy.activation_sha256, manual_readback_required: blind };
}
