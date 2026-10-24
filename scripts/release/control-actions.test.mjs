import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicationFixture } from "./fixtures/publication.mjs";
import { atTime } from "./fixtures/github.mjs";
import { prepareControlHandoff, executeControl } from "./control-actions.mjs";
import { Control, businessWrite, validateHistory } from "./control.mjs";
import { digest, json } from "./github.mjs";

async function controlFixture(t, mode = "retire-candidate") {
  const f = await publicationFixture(t);
  f.execution.event = "workflow_dispatch"; f.state.runs.get("101/1").event = "workflow_dispatch";
  f.state.jobs.clear(); f.state.artifacts.clear();
  ["Control approval summary", "Retire candidate", "Recover release control"].forEach((name, i) => {
    const id = 400 + i;
    f.state.jobs.set(id, { id, name, run_id: 101, head_sha: f.source, head_branch: "develop", status: i ? "in_progress" : "completed", conclusion: i ? null : "success", completed_at: "2026-10-24T11:00:00Z" }); f.state.jobAttempts.set(id, 1);
  });
  const review = Object.fromEntries(["tool_commit", "tool_tree", "verdict", "subject_type", "subject_id", "reviewed_at", "report_sha256"].map(key => [key, f.review[key]]));
  review.scope = ["workflow", "release-tool", "control-protocol"];
  f.controlInput = { mode, control_root: f.rootSha, source_sha: f.source, version: "0.5.4", reason: mode === "retire-candidate" ? "withdraw" : null, execution: f.execution, review };
  return f;
}
const now = work => atTime("2026-10-24T12:00:00Z", work);
const prepare = f => prepareControlHandoff(f.api(), f.controlInput, f.policy);
const execute = (f, handoff) => executeControl(f.api(), handoff, digest(json(handoff)), f.policy, f.execution, f.privateKey);
const outcome = f => JSON.parse(readFileSync(join(f.root, ".scratch/ai-agent-release/audit/outcome.json")));
function cli(f, mode, handoff, extra = {}) {
  const env = { ...process.env, FIXTURE_NOW: "2026-10-24T12:00:00Z", GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/develop", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_JOB: mode === "retire-candidate" ? "guard" : "control_recover", GITHUB_SHA: f.source, GITHUB_WORKFLOW_SHA: f.source, GITHUB_REPOSITORY: "test/repository", GITHUB_REPOSITORY_ID: "123", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1", GITHUB_TOKEN: "read-fixture-token", RELEASE_POLICY: JSON.stringify(f.policy), RELEASE_HANDOFF: JSON.stringify(handoff), RELEASE_HANDOFF_SHA256: digest(json(handoff)), RELEASE_APP_PRIVATE_KEY: f.privateKey, ...extra };
  const child = spawn(process.execPath, ["--import", f.preload, fileURLToPath(new URL("../release.mjs", import.meta.url)), mode, "--root", f.root], { cwd: f.root, env });
  let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data);
  return new Promise(resolve => child.on("close", code => resolve({ code, stdout, stderr })));
}

test("approved guard needs no package or CI aggregate and records only permanent source retirement", async t => now(async () => {
  const f = await controlFixture(t), handoff = await prepare(f);
  assert.equal(handoff.control_sha, f.rootSha); assert.equal(handoff.facts.main_sha, f.base);
  assert.match(handoff.consequence, /never be published/);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.ref("refs/heads/release-control"), f.rootSha);
  const result = await execute(f, handoff);
  assert.equal(result.status, "retired"); assert.deepEqual(f.readState().retired_sources, [f.source]); assert.equal(f.readState().owner, null);
  assert.equal(f.state.business.length, 0); assert.equal(f.ref("refs/heads/main"), f.base);
  assert.equal(result.approval.job_id, 401); assert.equal(f.state.appCalls.at(-1).method, "DELETE");
}));

test("control approval rejects changed facts, missing review, missing approval and unrestored default before App issuance", async t => now(async () => {
  const f = await controlFixture(t), handoff = await prepare(f), original = structuredClone(f.controlInput);
  for (const patch of [{ mode: "publish" }, { reason: "anything" }, { version: "0.5.5" }, { source_sha: f.base }, { review: { ...original.review, tool_commit: f.base } }]) await assert.rejects(prepareControlHandoff(f.api(), { ...original, ...patch }, f.policy));
  f.state.defaultBranch = "develop"; await assert.rejects(execute(f, handoff), /default branch/); f.state.defaultBranch = "main";
  f.state.approvals = []; await assert.rejects(execute(f, handoff), /approval/);
  f.state.approvals = [{ state: "approved", user: { id: 61 }, environments: [{ id: 51, name: "production" }] }];
  f.git("update-ref", "refs/heads/develop", f.base); await assert.rejects(execute(f, handoff), /current stable/);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.ref("refs/heads/release-control"), f.rootSha);
  assert.equal(f.state.business.length, 0);
}));

test("control recovery approves exact old-owner facts and clears no intent until terminal evidence exists", async t => now(async () => {
  const f = await controlFixture(t, "control-recover"), actor = { ...f.actor(300, "publish", Date.parse("2026-10-24T11:00:00Z")), source_sha: f.source, workflow_sha: f.source, tool_sha: f.source };
  const old = new Control(f.api(), f.rootSha, actor);
  await atTime("2026-10-24T10:00:00Z", () => old.claim());
  await assert.rejects(prepare(f), /termination/);
  f.state.jobs.get(300).status = "completed";
  const handoff = await prepare(f);
  assert.equal(handoff.facts.resolution, "no-pending-request"); assert.deepEqual(handoff.owner, actor);
  const before = f.ref("refs/heads/release-control"), result = await execute(f, handoff);
  assert.equal(result.status, "idle"); assert.equal(result.approval.job_id, 402); assert.notEqual(result.control_sha, before);
  assert.equal(f.readState().owner, null); assert.equal(f.state.business.length, 0); assert.equal(f.state.appCalls.at(-1).method, "DELETE");
}));

test("unknown prior request blocks control summary and an approved guard detects control predecessor drift", async t => now(async () => {
  const f = await controlFixture(t), handoff = await prepare(f), actor = { ...f.actor(300, "publish", Date.parse("2026-10-24T11:00:00Z")), source_sha: f.source, workflow_sha: f.source, tool_sha: f.source };
  const production = f.commit(f.git("show", "-s", "--format=%T", f.source), [f.base], "Synthetic main target");
  const old = new Control(f.api(), f.rootSha, actor), body = { sha: production, force: false };
  await atTime("2026-10-24T10:00:00Z", async () => {
    await old.claim(); f.state.mode = "unknown";
    await assert.rejects(businessWrite(old, { target: "main", data: { before_sha: f.base, after_sha: production }, request_sha256: digest(json({ method: "PATCH", path: "/git/refs/heads/main", body })) }, "PATCH", "/git/refs/heads/main", body), /unknown/);
  });
  f.state.jobs.get(300).status = "completed";
  await assert.rejects(execute(f, handoff), /idle/);
  f.controlInput.mode = "control-recover"; f.controlInput.reason = null;
  await assert.rejects(prepare(f), /unknown/);
  assert.equal(f.state.appCalls.length, 0); assert.ok(f.readState().owner);
}));

test("protected control CLI requires the reviewed handoff, exact job and App credential; external raw token is not a fallback", async t => now(async () => {
  const f = await controlFixture(t), handoff = await prepare(f);
  for (const extra of [{ GITHUB_ACTIONS: "false" }, { GITHUB_JOB: "test" }, { GITHUB_WORKFLOW_SHA: f.base }, { RELEASE_HANDOFF_SHA256: "0".repeat(64) }, { RELEASE_APP_PRIVATE_KEY: "", RELEASE_TOKEN: "write-fixture-token" }]) {
    const result = await cli(f, "retire-candidate", handoff, extra); assert.equal(result.code, 1); assert.doesNotMatch(result.stdout + result.stderr, /write-fixture-token|read-fixture-token|PRIVATE KEY/);
    assert.equal(f.ref("refs/heads/release-control"), f.rootSha);
  }
  f.state.failPath = "/releases"; const denied = await cli(f, "retire-candidate", handoff); assert.equal(denied.code, 1); assert.doesNotMatch(denied.stdout + denied.stderr, /fixture-token/); f.state.failPath = null;
  const ok = await cli(f, "retire-candidate", handoff); assert.equal(ok.code, 0, ok.stderr); assert.equal(JSON.parse(ok.stdout).status, "retired");
  assert.equal(f.state.business.length, 0); assert.equal(f.ref("refs/heads/main"), f.base);
}));

test("guard CLI preserves permanent retirement on terminal failure; a fresh approved control recovery CLI resolves ownership", async t => now(async () => {
  const f = await controlFixture(t), handoff = await prepare(f); let rejectedOnce = false;
  f.state.rejectControlBlob = state => { if (!rejectedOnce && state.record.type === "terminal") { rejectedOnce = true; return true; } return false; };
  const result = await cli(f, "retire-candidate", handoff); assert.equal(result.code, 1); assert.match(result.stderr, /permanently retired/);
  assert.equal(outcome(f).approval.job_id, 401); assert.equal(outcome(f).approval.handoff_sha256, digest(json(handoff))); assert.equal(outcome(f).status, "unconfirmed");
  assert.deepEqual(f.readState().retired_sources, [f.source]); assert.equal(f.readState().record.type, "retire"); assert.equal(f.readState().owner.job_id, 401);
  const invalid = (await new Control(f.api(), f.rootSha).read()).history, tip = invalid.at(-1);
  invalid.push({ sha: "d".repeat(40), parents: [tip.sha], state: { ...tip.state, previous_sha: tip.sha, sequence: tip.state.sequence + 1, owner: null, record: { type: "terminal", data: "rejected" } } });
  assert.throws(() => validateHistory(invalid, { root: f.rootSha, repositoryId: 123 }), /retirement/);
  f.state.jobs.get(401).status = "completed"; f.controlInput.mode = "control-recover"; f.controlInput.reason = null;
  const recovery = await atTime("2026-10-24T14:00:00Z", () => prepare(f));
  f.state.issued.expires_at = "2026-10-24T15:00:00Z";
  const noKey = await cli(f, "control-recover", recovery, { FIXTURE_NOW: "2026-10-24T14:00:00Z", RELEASE_APP_PRIVATE_KEY: "" });
  assert.equal(noKey.code, 1); assert.equal(outcome(f).approval.job_id, 402); assert.equal(outcome(f).approval.handoff_sha256, digest(json(recovery))); assert.equal(f.readState().owner.job_id, 401);
  const recovered = await cli(f, "control-recover", recovery, { FIXTURE_NOW: "2026-10-24T14:00:00Z" });
  assert.deepEqual(outcome(f).approval, JSON.parse(recovered.stdout).approval);
  assert.equal(recovered.code, 0, recovered.stderr); assert.equal(JSON.parse(recovered.stdout).status, "idle"); assert.equal(f.readState().owner, null); assert.deepEqual(f.readState().retired_sources, [f.source]); assert.equal(f.state.business.length, 0);
}));
