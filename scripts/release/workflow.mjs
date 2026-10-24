import { readFileSync, writeFileSync, appendFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dispatchInput, eventIdentity, verifyCheckout, fetchInputs } from "../ci.mjs";
import { git, checkHistoricalCandidate } from "../check-delivery.mjs";
import { checkRepository } from "../check-version.mjs";
import { GitHub, objectSha, id, hash, digest, json, reject } from "./github.mjs";
import { Control } from "./control.mjs";
import { buildProduction } from "./production.mjs";
import { verifyInstall } from "./install.mjs";
import { preflight, artifactFiles, installationProof, installPlatforms, workflowPath, equal } from "./evidence.mjs";
import { executionIdentity, prepareHandoff } from "./publication.mjs";
import { inspectRecovery, recoveryProof, prepareRecoveryHandoff } from "./recovery.mjs";
import { prepareControlHandoff } from "./control-actions.mjs";

export const workspace = ".scratch/ai-agent-release";
export function executionContext(root, env = process.env) {
  if (env.GITHUB_ACTIONS !== "true" || env.GITHUB_REF !== "refs/heads/develop" || !["push", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME)) reject("Release requires a trusted develop execution.");
  const tool = objectSha(git(root, ["rev-parse", "HEAD"]));
  equal([tool, objectSha(env.GITHUB_WORKFLOW_SHA)], [objectSha(env.GITHUB_SHA), tool], "Execution checkout differs from the fixed workflow/tool.");
  return { run_id: id(Number(env.GITHUB_RUN_ID)), run_attempt: id(Number(env.GITHUB_RUN_ATTEMPT)), workflow_sha: tool, tool_sha: tool, event: env.GITHUB_EVENT_NAME };
}

export function outputs(values, path = process.env.GITHUB_OUTPUT) {
  const lines = Object.entries(values).map(([key, value]) => {
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (!/^[a-z][a-z0-9_]*$/.test(key) || /[\r\n\0]/.test(text)) reject("Unsafe workflow output.");
    return `${key}=${text}\n`;
  }).join("");
  if (Buffer.byteLength(lines, "utf16le") > 900000) reject("Workflow output exceeds the bounded handoff size.");
  if (!path) reject("Workflow output path is missing.");
  appendFileSync(path, lines);
}

export function route(root, event, env = process.env) {
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    const input = dispatchInput(event.inputs), execution = executionContext(root, env);
    if (input.expected_tool_sha && input.expected_tool_sha !== execution.tool_sha) reject("Dispatch tool changed after entry preparation.");
    if (input.operation !== "ci" && env.RELEASE_ENABLED !== "true") reject("Production workflow is disabled pending platform activation.");
    return { ci: input.operation === "ci", operation: input.operation, input };
  }
  const identity = eventIdentity(env.GITHUB_EVENT_NAME, event, env); verifyCheckout(root, identity);
  const version = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"))).version;
  return { ci: true, operation: identity.event === "push" && env.RELEASE_ENABLED === "true" && !version.includes("-dev.") ? "publish" : "ci", input: {} };
}

export function pushRefProof(root, event, api, env = process.env) {
  const identity = eventIdentity(env.GITHUB_EVENT_NAME, event, env); verifyCheckout(root, identity);
  const execution = executionContext(root, env);
  if (execution.event !== "push" || env.GITHUB_WORKFLOW_REF !== `${api.repository}/${workflowPath}@refs/heads/develop`) reject("Full-ref evidence requires this exact develop push workflow.");
  return { schema_version: 1, repository_id: api.repositoryId, repository: api.repository, workflow_ref: env.GITHUB_WORKFLOW_REF, workflow_sha: execution.workflow_sha, ref: identity.ref, head_sha: identity.head, event: "push", run_id: execution.run_id, run_attempt: execution.run_attempt, check_set_version: "1" };
}

export function artifactBinding(execution, name, artifactId, artifactDigest) {
  return { id: id(Number(artifactId)), digest: hash(artifactDigest), name, run_id: execution.run_id, head_sha: execution.workflow_sha };
}

function save(root, name, value) {
  const path = join(root, workspace, name); mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.isBuffer(value) ? value : json(value)); return path;
}
const load = name => JSON.parse(process.env[name] ?? "null");
function getAPI(env = process.env) {
  return new GitHub({ repository: env.GITHUB_REPOSITORY, repositoryId: id(Number(env.GITHUB_REPOSITORY_ID)), readToken: env.GITHUB_TOKEN });
}

export function fetchRelease(root, api, source, base, objects, controlRoot) {
  const origin = git(root, ["remote", "get-url", "origin"]), remote = `https://github.com/${api.repository}`;
  if (![remote, remote + ".git"].includes(origin)) reject("Release fetch origin differs from the target repository.");
  return fetchInputs(root, { base, head: source }, origin, api.readToken, { objects: [objectSha(controlRoot), ...objects], control: true });
}

export async function prepareRun(api, root, input, event, execution, policy, controlRoot, refArtifact) {
  await preflight(api, policy); await executionIdentity(api, execution, policy);
  const control = await new Control(api, controlRoot).read(), recipe = control.history[0].state.record.data;
  const recovering = input.operation === "recover";
  let source, base;
  if (execution.event === "push") {
    const identity = eventIdentity("push", event, process.env); verifyCheckout(root, identity);
    source = identity.head; base = await api.ref("heads/main");
  } else { source = objectSha(input.source_sha); base = objectSha(input.base_sha); }
  fetchRelease(root, api, source, base, [recipe.tool_sha, ...(recovering ? [objectSha(input.production_sha), objectSha(input.receipt_sha)] : [])], controlRoot);
  const identity = recovering ? { source_sha: source, base_sha: base, production_sha: input.production_sha, receipt_sha: input.receipt_sha, version: input.version, control_root: controlRoot } : null;
  const state = recovering ? await inspectRecovery(api, root, identity, policy) : null;
  const built = buildProduction(root, { source, base });
  if (input.version && input.version !== built.summary.version) reject("Dispatch version differs from the candidate.");
  if (!recovering) {
    if (control.tip.state.owner || control.tip.state.intent || control.tip.state.retired_sources.includes(source)) reject("First publication is blocked by control state.");
    if (await api.ref("heads/develop") !== source) reject("First publication source must be current develop.");
    checkHistoricalCandidate(root, source, base, control.tip.state.retired_sources);
  }
  const original = recovering ? null : { source_sha: source, run_id: execution.event === "push" ? execution.run_id : id(Number(input.push_run_id)), run_attempt: execution.event === "push" ? execution.run_attempt : id(Number(input.push_attempt)), ref_artifact_id: execution.event === "push" ? id(Number(refArtifact.id)) : id(Number(input.ref_artifact_id)), ref_artifact_digest: execution.event === "push" ? hash(refArtifact.digest) : hash(input.ref_artifact_digest), workflow_id: policy.workflow_id, actions_app_id: policy.actions_app_id, recipe_tool_sha: recipe.tool_sha };
  for (const [name, bytes] of built.bundle) save(root, `bundle/${name}`, bytes);
  return { operation: recovering ? "recover" : "publish", source_sha: source, base_sha: base, control_root: controlRoot, candidate: built.summary, execution, original_ci: original, identity, recipe: state?.recipe ?? recipe };
}

export async function installRun(api, root, prepared, artifact, platform, policy) {
  if (!installPlatforms.includes(platform)) reject("Unexpected installation platform.");
  equal(prepared.execution, executionContext(root), "Installation tool differs from preparation.");
  fetchRelease(root, api, prepared.source_sha, prepared.base_sha, [prepared.recipe.tool_sha], prepared.control_root);
  const built = buildProduction(root, { source: prepared.source_sha, base: prepared.base_sha });
  equal(built.summary, prepared.candidate, "Installation candidate differs from preparation.");
  const files = await artifactFiles(api, artifact, [...built.bundle.keys()]);
  const bundle = mkdtempSync(join(tmpdir(), "ai-agent-install-input-"));
  try {
    for (const [name, bytes] of files) writeFileSync(join(bundle, name), bytes, { flag: "wx" });
    await verifyInstall(root, { source: prepared.source_sha, base: prepared.base_sha, bundle, expected: prepared.candidate });
  } finally { rmSync(bundle, { recursive: true, force: true }); }
  const jobs = await executionIdentity(api, prepared.execution, policy), found = jobs.filter(job => job.name === `Install archive (${platform})`);
  if (found.length !== 1 || found[0].status !== "in_progress" || found[0].head_sha !== prepared.execution.tool_sha) reject("Installation execution job is not confirmed.");
  // The proof is created only after the actual consumed ZIP and independent tree checks succeed.
  return installationProof(api, prepared.execution, artifact, prepared.candidate, platform, found[0].id);
}

export function candidateTests(root, sourceRoot, source) {
  if (git(sourceRoot, ["rev-parse", "HEAD"]) !== objectSha(source)) reject("Recovery source checkout differs.");
  const files = readdirSync(join(sourceRoot, "scripts"), { recursive: true }).filter(path => path.endsWith(".test.mjs") && path !== "affinity-mcp-proxy.test.mjs").sort();
  for (const required of ["docs-hooks.test.mjs", "check-version.test.mjs", "inspection-preview.test.mjs"]) if (!files.includes(required)) reject("Historical source is missing required applicable tests.");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(RELEASE_|ACTIONS_|INPUT_|NODE_OPTIONS$|NODE_PATH$|NODE_TEST_CONTEXT$|GITHUB_TOKEN$|GH_TOKEN$)/.test(key)));
  const run = args => execFileSync(process.execPath, args, { cwd: sourceRoot, env, stdio: "inherit" });
  checkRepository(sourceRoot, { channel: "stable" });
  run(["scripts/docs-hooks.mjs", "check"]);
  execFileSync(process.execPath, [join(root, "scripts/check-links.mjs"), "--root", sourceRoot], { cwd: root, env, stdio: "inherit" });
  run(["--test", ...files.map(path => join("scripts", path))]); run(["scripts/affinity-mcp-proxy.test.mjs"]);
}

export function productionDiff(root, prepared) {
  const built = buildProduction(root, { source: prepared.source_sha, base: prepared.base_sha }), folder = mkdtempSync(join(tmpdir(), "ai-agent-production-diff-"));
  const write = (side, path, bytes) => { const target = join(folder, side, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes); };
  try {
    for (const path of git(root, ["ls-tree", "-r", "--name-only", prepared.base_sha]).split("\n").filter(Boolean)) write("before", path, execFileSync("git", ["--no-lazy-fetch", "--no-replace-objects", "show", `${prepared.base_sha}:${path}`], { cwd: root, maxBuffer: 256 * 1024 * 1024 }));
    for (const file of built.files) write("after", file.path, file.bytes);
    let result;
    try { result = execFileSync("git", ["diff", "--no-index", "--binary", "--no-ext-diff", "--", "before", "after"], { cwd: folder, stdio: "pipe", maxBuffer: 256 * 1024 * 1024 }); }
    catch (error) { if (error.status !== 1) reject("Cannot construct full production diff."); result = error.stdout; }
    return result;
  } finally { rmSync(folder, { recursive: true, force: true }); }
}

export async function workflowStep(mode, root = process.cwd()) {
  const env = process.env;
  if (env.RELEASE_APP_PRIVATE_KEY || env.RELEASE_TOKEN) reject("Preparation must not receive production credentials.");
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  if (mode === "route") { outputs(route(root, event, env)); return; }
  const api = getAPI(env), execution = executionContext(root, env);
  if (mode === "push-ref") {
    save(root, "push-ref/push-ref.json", pushRefProof(root, event, api, env));
    outputs({ name: `push-ref-${execution.tool_sha}-${execution.run_id}-${execution.run_attempt}` }); return;
  }
  if (mode === "bind") { outputs({ binding: artifactBinding(execution, env.RELEASE_ARTIFACT_NAME, env.RELEASE_ARTIFACT_ID, env.RELEASE_ARTIFACT_DIGEST) }); return; }
  if (env.RELEASE_ENABLED !== "true") reject("Production workflow is disabled pending platform activation.");
  const policy = load("RELEASE_POLICY"), controlRoot = objectSha(env.RELEASE_CONTROL_ROOT);
  const input = execution.event === "workflow_dispatch" ? dispatchInput(event.inputs) : { operation: "publish" };
  if (input.expected_tool_sha && input.expected_tool_sha !== execution.tool_sha) reject("Dispatch tool differs from the expected identity.");
  if (mode === "prepare") {
    const prepared = await prepareRun(api, root, input, event, execution, policy, controlRoot, execution.event === "push" ? load("RELEASE_REF_ARTIFACT") : null);
    save(root, "preparation.json", prepared); outputs({ prepared, source_sha: prepared.source_sha, name: `release-${prepared.source_sha}-${execution.run_id}-${execution.run_attempt}` }); return;
  }
  if (mode === "control-summary") {
    const handoff = await prepareControlHandoff(api, { mode: input.operation, source_sha: input.source_sha, version: input.version, reason: input.reason ?? null, control_root: controlRoot, execution, review: load("RELEASE_CONTROL_REVIEW") }, policy);
    return summary(root, handoff);
  }
  const prepared = load("RELEASE_PREPARED"), artifact = load("RELEASE_ARTIFACT");
  equal(prepared.execution, execution, "Preparation belongs to another execution.");
  if (mode === "install") { save(root, "installation/installation.json", await installRun(api, root, prepared, artifact, env.RELEASE_PLATFORM, policy)); outputs({ name: `installation-${prepared.source_sha}-${execution.run_id}-${execution.run_attempt}-${env.RELEASE_PLATFORM}` }); return; }
  fetchRelease(root, api, prepared.source_sha, prepared.base_sha, [prepared.recipe.tool_sha, ...(prepared.identity ? [prepared.identity.production_sha, prepared.identity.receipt_sha] : [])], controlRoot);
  if (mode === "fetch") return;
  if (mode === "recovery-policy") { await inspectRecovery(api, root, prepared.identity, policy); return; }
  if (mode === "recovery-test") { candidateTests(root, resolve(root, ".scratch/ai-agent-source"), prepared.source_sha); return; }
  const installations = load("RELEASE_INSTALLATIONS");
  if (mode === "recovery-proof") {
    if (prepared.operation !== "recover") reject("Recovery proof requires a recovery preparation.");
    save(root, "validation/recovery-validation.json", recoveryProof(api, prepared.identity, execution, prepared.candidate, prepared.recipe, artifact, installations));
    outputs({ name: `recovery-${prepared.source_sha}-${execution.run_id}-${execution.run_attempt}` }); return;
  }
  if (mode !== "summary") reject("Unknown workflow step.");
  const handoff = await (prepared.operation === "recover" ? prepareRecoveryHandoff(api, root, { identity: prepared.identity, execution, artifact, installations, validation: load("RELEASE_VALIDATION"), review: load("RELEASE_REVIEW") }, policy) : prepareHandoff(api, root, { source_sha: prepared.source_sha, base_sha: prepared.base_sha, control_root: controlRoot, original_ci: prepared.original_ci, execution, artifact, installations, review: load("RELEASE_REVIEW") }, policy));
  save(root, "audit/production.diff", productionDiff(root, prepared));
  for (const path of ["CHANGELOG.md", "CHANGELOG.zh-cn.md"]) save(root, `audit/${path}`, execFileSync("git", ["--no-lazy-fetch", "--no-replace-objects", "show", `${prepared.source_sha}:${path}`], { cwd: root }));
  summary(root, handoff);
}

function summary(root, handoff) {
  const value = { handoff, handoff_sha256: digest(json(handoff)) };
  save(root, "audit/approval-summary.json", value);
  const escaped = JSON.stringify(value, null, 2).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  if (!process.env.GITHUB_STEP_SUMMARY) reject("Approval summary output is missing.");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<pre>${escaped}</pre>\n${handoff.candidate ? "Review the matching audit artifact for the complete production diff and bilingual changelog." : "This approval only permits the displayed control operation and its permanent consequences."}\n`);
  outputs(value);
}

if (import.meta.main) {
  try { if (process.argv.length !== 3) reject("Usage: workflow.mjs <step>"); await workflowStep(process.argv[2]); }
  catch (error) { console.error(`Workflow preparation failed: ${error.message}`); process.exitCode = 1; }
}
