import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { outputs, artifactBinding, executionContext, route, pushRefProof, productionDiff, workspace } from "./workflow.mjs";
import { publicationFixture } from "./fixtures/publication.mjs";
import { json, digest } from "./github.mjs";
import { installationProof } from "./evidence.mjs";
import { prepareHandoff, publish } from "./publication.mjs";
import { Control } from "./control.mjs";
import { atTime } from "./fixtures/github.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
async function runFixture(t) {
  const f = await publicationFixture(t), checkout = mkdtempSync(join(tmpdir(), "ai-agent-workflow-"));
  t.after(() => rmSync(checkout, { recursive: true, force: true }));
  execFileSync("git", ["clone", "--no-hardlinks", f.root, checkout], { stdio: "pipe" });
  const git = args => execFileSync("git", args, { cwd: checkout, stdio: "pipe", encoding: "utf8" });
  git(["remote", "set-url", "origin", "https://github.com/test/repository"]);
  const localFetch = join(checkout, "local-fetch.mjs");
  writeFileSync(localFetch, `import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=child.execFileSync;child.execFileSync=(command,args,...rest)=>{if(command==='git'&&args[0]==='fetch'){if(!args.includes('origin'))throw Error('Unexpected fetch');args=args.map(arg=>arg==='origin'?${JSON.stringify(f.root)}:arg)}return original(command,args,...rest)};syncBuiltinESMExports();`);
  const event = join(checkout, "event.json"), output = join(checkout, "outputs.txt"), summary = join(checkout, "summary.txt");
  writeFileSync(event, JSON.stringify({ ref: "refs/heads/develop", before: f.development, after: f.source }));
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/develop", GITHUB_SHA: f.source, GITHUB_WORKFLOW_SHA: f.source, GITHUB_WORKFLOW_REF: "test/repository/.github/workflows/docs-hooks.yml@refs/heads/develop", GITHUB_REPOSITORY: "test/repository", GITHUB_REPOSITORY_ID: "123", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1", GITHUB_TOKEN: "read-fixture-token", GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, RELEASE_ENABLED: "true", RELEASE_POLICY: JSON.stringify(f.policy), RELEASE_CONTROL_ROOT: f.rootSha, FIXTURE_NOW: "2026-10-24T12:00:00Z", RELEASE_REF_ARTIFACT: JSON.stringify({ id: 201, digest: f.original.ref_artifact_digest }) };
  const run = async (mode, extra = {}) => {
    writeFileSync(output, "");
    const child = spawn(process.execPath, ["--import", f.preload, "--import", pathToFileURL(localFetch).href, join(root, mode === "ci-policy" ? "scripts/ci.mjs" : "scripts/release/workflow.mjs"), mode === "ci-policy" ? "policy" : mode], { cwd: checkout, env: { ...env, ...extra } });
    let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data);
    const code = await new Promise(resolve => child.once("close", resolve));
    return { code, stdout, stderr, outputs: Object.fromEntries(readFileSync(output, "utf8").split("\n").filter(Boolean).map(line => { const equals = line.indexOf("="); return [line.slice(0, equals), line.slice(equals + 1)]; })) };
  };
  return Object.assign(f, { checkout, eventFile: event, env, run });
}

test("workflow route and full-ref proof bind event, checkout and fixed tool; outputs reject injection and oversized handoffs", async t => {
  const f = await runFixture(t), event = JSON.parse(readFileSync(f.eventFile));
  assert.equal(route(f.checkout, event, f.env).operation, "publish");
  assert.equal(route(f.checkout, event, { ...f.env, RELEASE_ENABLED: "false" }).operation, "ci");
  assert.deepEqual(pushRefProof(f.checkout, event, f.api(), f.env), f.proof);
  assert.throws(() => executionContext(f.checkout, { ...f.env, GITHUB_WORKFLOW_SHA: f.base }));
  assert.throws(() => pushRefProof(f.checkout, event, f.api(), { ...f.env, GITHUB_WORKFLOW_REF: "test/repository/.github/workflows/docs-hooks.yml@refs/tags/develop" }));
  const dispatch = { inputs: { operation: "retire-candidate", source_sha: f.source, version: "0.5.4", reason: "withdraw", expected_tool_sha: f.source, entry_id: "e".repeat(32) } };
  const manual = { ...f.env, GITHUB_EVENT_NAME: "workflow_dispatch" };
  assert.equal(route(f.checkout, dispatch, manual).ci, false);
  assert.throws(() => route(f.checkout, dispatch, { ...manual, RELEASE_ENABLED: "false" }));
  assert.throws(() => route(f.checkout, dispatch, { ...manual, GITHUB_SHA: f.base }));
  assert.throws(() => outputs({ unsafe: "ok\nbad=value" }, f.env.GITHUB_OUTPUT));
  assert.throws(() => outputs({ too_big: "x".repeat(450001) }, f.env.GITHUB_OUTPUT));
  const actual = await f.run("push-ref"); assert.equal(actual.code, 0, actual.stderr);
  assert.deepEqual(readFileSync(join(f.checkout, workspace, "push-ref/push-ref.json")), json(f.proof));
  assert.equal((await f.run("route", { RELEASE_APP_PRIVATE_KEY: "must-not-print" })).code, 1);
});

test("actual CI policy dispatches the explicit promotion checker only with enabled fixed control evidence", async t => {
  const f = await runFixture(t);
  const disabled = await f.run("ci-policy", { RELEASE_ENABLED: "false" }); assert.equal(disabled.code, 1); assert.match(disabled.stderr, /disabled/);
  const valid = await f.run("ci-policy"); assert.equal(valid.code, 0, valid.stderr); assert.match(valid.stdout, /promote/);
  f.state.failPath = "/releases"; const unknown = await f.run("ci-policy"); assert.equal(unknown.code, 1); assert.doesNotMatch(unknown.stderr, /fixture-token/);
  assert.equal(f.state.business.length, 0); assert.equal(f.ref("refs/heads/release-control"), f.rootSha);
});

test("actual workflow CLI prepares one bundle, checks its exact downloaded ZIP and emits the installation proof only after success", async t => {
  const f = await runFixture(t), preparedResult = await f.run("prepare"); assert.equal(preparedResult.code, 0, preparedResult.stderr);
  const prepared = JSON.parse(preparedResult.outputs.prepared); assert.deepEqual(prepared.candidate, f.built.summary);
  for (const [name, bytes] of f.built.bundle) assert.deepEqual(readFileSync(join(f.checkout, workspace, "bundle", name)), bytes);
  const artifact = f.input.artifact, platform = "macos-latest", job = [...f.state.jobs.values()].find(job => job.name === `Install archive (${platform})`); job.status = "in_progress"; job.conclusion = null;
  const extra = { RELEASE_PREPARED: JSON.stringify(prepared), RELEASE_ARTIFACT: JSON.stringify(artifact), RELEASE_PLATFORM: platform };
  const wrong = await f.run("install", { ...extra, RELEASE_ARTIFACT: JSON.stringify({ ...artifact, digest: "0".repeat(64) }) }); assert.equal(wrong.code, 1);
  assert.throws(() => readFileSync(join(f.checkout, workspace, "installation/installation.json")));
  const installed = await f.run("install", extra); assert.equal(installed.code, 0, installed.stderr);
  assert.deepEqual(readFileSync(join(f.checkout, workspace, "installation/installation.json")), json(installationProof(f.api(), f.execution, artifact, prepared.candidate, platform, job.id)));
  assert.equal(f.state.business.length, 0); assert.equal(f.state.appCalls.length, 0);
});

test("dispatch publication and old-source recovery prepare through the actual CLI without a skipped policy job's ref artifact", async t => atTime("2026-10-24T12:00:00Z", async () => {
  const f = await runFixture(t);
  const manual = { ...f.state.runs.get("101/1"), id: 202, event: "workflow_dispatch" };
  f.state.runs.set("202/1", manual);
  const input = { operation: "publish", source_sha: f.source, base_sha: f.base, version: "0.5.4", push_run_id: "101", push_attempt: "1", ref_artifact_id: "201", ref_artifact_digest: f.original.ref_artifact_digest, expected_tool_sha: f.source, entry_id: "e".repeat(32) };
  writeFileSync(f.eventFile, JSON.stringify({ inputs: input }));
  const extra = { GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ID: "202", RELEASE_REF_ARTIFACT: "" };
  const first = await f.run("prepare", extra); assert.equal(first.code, 0, first.stderr);
  const prepared = JSON.parse(first.outputs.prepared); assert.deepEqual(prepared.original_ci, f.original); assert.equal(prepared.execution.run_id, 202);
  assert.equal(f.state.business.length, 0); assert.equal(f.state.appCalls.length, 0);
  const handoff = await prepareHandoff(f.api(), f.root, f.input, f.policy), previous = f.state.route;
  f.state.route = async request => { if (request.method === "POST" && request.path === "/git/refs" && f.readState().intent?.target === "tag") f.state.mode = "reject"; return previous(request); };
  await assert.rejects(publish(f.api(), f.root, handoff, digest(json(handoff)), f.policy, f.execution, f.privateKey), /rejected/);
  f.state.mode = "normal"; f.state.route = previous;
  const control = await new Control(f.api(), f.rootSha).read(), receipt = control.history.find(item => item.state.record.type === "receipt");
  const tool = f.commit(f.git("show", "-s", "--format=%T", f.source), [f.source], "Later recovery tool"); f.git("update-ref", "refs/heads/develop", tool);
  execFileSync("git", ["fetch", f.root, tool], { cwd: f.checkout, stdio: "pipe" }); execFileSync("git", ["checkout", "--detach", tool], { cwd: f.checkout, stdio: "pipe" });
  manual.head_sha = tool;
  const recovery = { operation: "recover", source_sha: f.source, base_sha: f.base, production_sha: f.ref("refs/heads/main"), receipt_sha: receipt.sha, version: "0.5.4", expected_tool_sha: tool, entry_id: input.entry_id };
  writeFileSync(f.eventFile, JSON.stringify({ inputs: recovery }));
  const before = [f.state.business.length, f.state.appCalls.length];
  const result = await f.run("prepare", { ...extra, GITHUB_SHA: tool, GITHUB_WORKFLOW_SHA: tool }); assert.equal(result.code, 0, result.stderr);
  const restored = JSON.parse(result.outputs.prepared); assert.equal(restored.source_sha, f.source); assert.equal(restored.execution.tool_sha, tool); assert.equal(restored.identity.receipt_sha, receipt.sha); assert.equal(restored.original_ci, null); assert.deepEqual(restored.candidate, f.built.summary);
  assert.deepEqual([f.state.business.length, f.state.appCalls.length], before);
}));

test("push preparation still rejects absent ref evidence and a source that is no longer develop tip", async t => {
  const f = await runFixture(t);
  const absent = await f.run("prepare", { RELEASE_REF_ARTIFACT: "" }); assert.equal(absent.code, 1); assert.equal(absent.outputs.prepared, undefined);
  f.git("update-ref", "refs/heads/develop", f.base);
  const stale = await f.run("prepare"); assert.equal(stale.code, 1); assert.match(stale.stderr, /current develop/); assert.equal(stale.outputs.prepared, undefined);
  assert.equal(f.state.business.length, 0); assert.equal(f.state.appCalls.length, 0);
});

test("actual approval summary binds review and package, exports complete diff and both changelogs, and fails before approval on missing evidence", async t => {
  const f = await runFixture(t), start = await f.run("prepare"); assert.equal(start.code, 0, start.stderr);
  const prepared = JSON.parse(start.outputs.prepared), extra = { RELEASE_PREPARED: start.outputs.prepared, RELEASE_ARTIFACT: JSON.stringify(f.input.artifact), RELEASE_INSTALLATIONS: JSON.stringify(f.input.installations), RELEASE_REVIEW: JSON.stringify(f.review) };
  const failed = await f.run("summary", { ...extra, RELEASE_INSTALLATIONS: "[]" }); assert.equal(failed.code, 1); assert.equal(failed.outputs.handoff, undefined);
  const result = await f.run("summary", extra); assert.equal(result.code, 0, result.stderr);
  const handoff = JSON.parse(result.outputs.handoff); assert.equal(digest(json(handoff)), result.outputs.handoff_sha256);
  assert.deepEqual(readFileSync(join(f.checkout, workspace, "audit/production.diff")), productionDiff(f.checkout, prepared));
  assert.match(readFileSync(join(f.checkout, workspace, "audit/CHANGELOG.zh-cn.md"), "utf8"), /合成发布/);
  assert.deepEqual(JSON.parse(readFileSync(join(f.checkout, workspace, "audit/approval-summary.json"))).handoff, handoff);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.state.business.length, 0);
});

test("workflow source keeps the required gate independent, pins every action and limits secrets and queues to three protected jobs", () => {
  const text = readFileSync(join(root, ".github/workflows/docs-hooks.yml"), "utf8");
  const jobs = Object.fromEntries([...text.matchAll(/^  ([a-z_]+):\n([\s\S]*?)(?=^  [a-z_]+:\n|$(?![\s\S]))/gm)].map(match => [match[1], match[2]]));
  assert.match(jobs.required, /if: \$\{\{ always\(\) \}\}/); assert.match(jobs.required, /needs: \[test, policy\]/);
  assert.doesNotMatch(jobs.required, /environment:|concurrency:|secrets\./);
  assert.match(jobs.control_summary, /needs: route/); assert.doesNotMatch(jobs.control_summary, /needs:.*(?:required|prepare|install)/);
  for (const name of ["publish", "guard", "control_recover"]) {
    assert.match(jobs[name], /environment: production/); assert.match(jobs[name], /group: affinity-mcp-production\n      queue: max\n      cancel-in-progress: false/); assert.equal((jobs[name].match(/secrets\.RELEASE_APP_PRIVATE_KEY/g) ?? []).length, 1);
  }
  for (const [name, job] of Object.entries(jobs)) if (!["publish", "guard", "control_recover"].includes(name)) assert.doesNotMatch(job, /secrets\.|environment: production|concurrency:/);
  for (const match of text.matchAll(/uses: (.+)/g)) assert.match(match[1], /^actions\/[\w-]+@[a-f0-9]{40} #/);
  for (const key of ["windows", "macos", "linux"]) { assert.match(jobs[`install_${key}`], /needs: prepare/); assert.match(jobs[`install_${key}`], /RELEASE_ARTIFACT: \$\{\{ needs.prepare.outputs.artifact \}\}/); }
  assert.match(jobs.recovery_test, /path: .scratch\/release\/materials\/source/); assert.match(jobs.recovery_test, /ref: \$\{\{ needs.prepare.outputs.source_sha \}\}/);
  assert.equal((text.match(/permissions:\n      contents: write/g) ?? []).length, 0);
  assert.deepEqual(artifactBinding({ run_id: 1, tool_sha: "a".repeat(40), workflow_sha: "a".repeat(40) }, "fixed", "2", "b".repeat(64)), { id: 2, digest: "b".repeat(64), name: "fixed", run_id: 1, head_sha: "a".repeat(40) });
});

test("historical test runner executes the selected source's complete applicable tests with credentials removed, and propagates failure", async t => {
  const f = await runFixture(t), files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const version = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"))).version;
  for (const path of files) { const target = join(f.checkout, path); mkdirSync(dirname(target), { recursive: true }); cpSync(join(root, path), target); }
  for (const path of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs", "docs/README.md", "docs/architecture.md", "docs/sdk/README.md"]) {
    const pathOnDisk = join(f.checkout, path); writeFileSync(pathOnDisk, readFileSync(pathOnDisk, "utf8").replaceAll(version, "0.5.4"));
  }
  for (const name of ["CHANGELOG.md", "CHANGELOG.zh-cn.md"]) writeFileSync(join(f.checkout, name), f.built.files.find(file => file.path === name).bytes);
  const tests = files.filter(path => path.startsWith("scripts/") && path.endsWith(".test.mjs"));
  const marker = `import {mkdirSync,appendFileSync} from 'node:fs';import assert from 'node:assert/strict';assert.equal(process.env.GITHUB_TOKEN,undefined);assert.equal(process.env.RELEASE_SENTINEL,undefined);assert.equal(process.env.ACTIONS_RUNTIME_TOKEN,undefined);mkdirSync('.scratch/materials/test-execution',{recursive:true});appendFileSync('.scratch/materials/test-execution/ran.jsonl',JSON.stringify(process.argv[1].replaceAll('\\\\','/').split('/scripts/')[1])+'\\n');`;
  for (const path of tests) writeFileSync(join(f.checkout, path), marker);
  const git = args => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "-c", "core.hooksPath=", "-c", "commit.gpgsign=false", ...args], { cwd: f.checkout, stdio: "pipe", env: { ...process.env, GIT_AUTHOR_DATE: "2026-10-24T00:00:00Z", GIT_COMMITTER_DATE: "2026-10-24T00:00:00Z" } }).toString().trim();
  git(["add", "--", ...files]); git(["commit", "-m", "Synthetic historical validation source"]); const source = git(["rev-parse", "HEAD"]);
  const code = `import {candidateTests} from ${JSON.stringify(new URL("workflow.mjs", import.meta.url).href)};candidateTests(${JSON.stringify(root)},${JSON.stringify(f.checkout)},${JSON.stringify(source)});`;
  const run = () => new Promise(resolve => { const child = spawn(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, GITHUB_TOKEN: "read-only-fixture", RELEASE_SENTINEL: "untrusted-must-not-see", ACTIONS_RUNTIME_TOKEN: "runtime-must-not-see" }, stdio: ["ignore", "pipe", "pipe"] }); let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data); child.once("close", code => resolve({ code, stdout, stderr })); });
  const result = await run(); assert.equal(result.code, 0, result.stdout + result.stderr);
  const ran = readFileSync(join(f.checkout, ".scratch/materials/test-execution/ran.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(ran.sort(), tests.map(path => path.slice(8)).sort());
  writeFileSync(join(f.checkout, "scripts/ci.test.mjs"), "throw new Error('Synthetic old-source failure');\n");
  const failed = await run(); assert.equal(failed.code, 1); assert.match(failed.stdout + failed.stderr, /Synthetic old-source failure/);
});
