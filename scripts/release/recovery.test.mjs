import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { publicationFixture } from "./fixtures/publication.mjs";
import { atTime } from "./fixtures/github.mjs";
import { prepareHandoff, publish } from "./publication.mjs";
import { inspectRecovery, prepareRecoveryHandoff, resumePublication, recoveryProof, recoveryJobs, recoveryReport } from "./recovery.mjs";
import { installNames } from "./publication.mjs";
import { installPlatforms, installationProof, readPushCI, readHistoricalCI } from "./evidence.mjs";
import { Control } from "./control.mjs";
import { digest, json } from "./github.mjs";
import { checkHistoricalCandidate } from "../check-delivery.mjs";

const now = work => atTime("2026-10-24T12:00:00Z", work);
async function partial(t, stopAt = "tag") {
  const f = await publicationFixture(t), handoff = await prepareHandoff(f.api(), f.root, f.input, f.policy), previous = f.state.route;
  let assets = 0;
  f.state.route = async request => {
    const target = f.readState().intent?.target;
    if ((request.method === "POST" && ["/git/refs", "/releases"].includes(request.path)) || (request.method === "POST" && request.path.endsWith("/assets")) || (request.method === "PATCH" && /^\/releases\/\d+$/.test(request.path))) {
      if (target === "asset") assets++;
      if (target === stopAt && (stopAt !== "asset" || assets === 2)) f.state.mode = "reject";
    }
    return previous(request);
  };
  if (stopAt) await assert.rejects(publish(f.api(), f.root, handoff, digest(json(handoff)), f.policy, f.execution, f.privateKey), /rejected/);
  else await publish(f.api(), f.root, handoff, digest(json(handoff)), f.policy, f.execution, f.privateKey);
  f.state.mode = "normal"; f.state.route = previous;
  const control = await new Control(f.api(), f.rootSha).read(), receipt = control.history.find(item => item.state.record.type === "receipt");
  f.identity = { source_sha: f.source, base_sha: f.base, production_sha: f.ref("refs/heads/main"), receipt_sha: receipt.sha, version: "0.5.4", control_root: f.rootSha };
  f.receipt = receipt.state.record.data;
  assert.equal(f.readState().owner, null);
  return f;
}
async function newRun(f) {
  const tool = f.commit(f.git("show", "-s", "--format=%T", f.source), [f.source], "New recovery tool execution");
  f.git("update-ref", "refs/heads/develop", tool);
  const execution = { run_id: 202, run_attempt: 1, workflow_sha: tool, tool_sha: tool, event: "workflow_dispatch" };
  f.state.runs.set("202/1", { ...f.state.runs.get("101/1"), id: 202, run_attempt: 1, head_sha: tool, event: "workflow_dispatch", check_suite_id: 222 });
  [...recoveryJobs, ...installNames, "Prepare release", "Release approval summary", "Publish release"].forEach((name, i) => {
    const id = i + 200, checkId = id + 1000, status = name === "Publish release" ? "in_progress" : "completed";
    f.state.jobs.set(id, { id, name, run_id: 202, head_sha: tool, head_branch: "develop", status, conclusion: status === "completed" ? "success" : null, completed_at: "2026-10-24T01:00:00Z", check_run_url: `https://api.github.com/repos/test/repository/check-runs/${checkId}` }); f.state.jobAttempts.set(id, 1);
    f.state.checks.set(checkId, { id: checkId, name, head_sha: tool, check_suite: { id: 222 }, app: { id: 15368, slug: "github-actions" }, status, conclusion: status === "completed" ? "success" : null, completed_at: "2026-10-24T01:00:00Z" });
  });
  const route = f.state.route;
  f.state.route = async request => {
    if (request.path === "/actions/runs/202/approvals") { request.reply(f.state.approvals); return true; }
    return route(request);
  };
  const artifact = (id, name, files) => {
    const binding = f.artifact(id, name, files), value = f.state.artifacts.get(id);
    Object.assign(value.workflow_run, { id: 202, head_sha: tool }); return { ...binding, run_id: 202, head_sha: tool };
  };
  const state = await inspectRecovery(f.api(), f.root, f.identity, f.policy);
  const bundle = artifact(203, `release-${f.source}-202-1`, f.built.bundle);
  const installations = installPlatforms.map((platform, i) => artifact(221 + i, `installation-${f.source}-202-1-${platform}`, new Map([["installation.json", json(installationProof(f.api(), execution, bundle, state.candidate, platform, 206 + i))]])));
  const proof = recoveryProof(f.api(), f.identity, execution, state.candidate, state.recipe, bundle, installations);
  const validation = artifact(204, `recovery-${f.source}-202-1`, new Map([["recovery-validation.json", json(proof)]]));
  const review = { ...f.review, tool_commit: tool, tool_tree: f.git("show", "-s", "--format=%T", tool) };
  f.recoveryInput = { identity: f.identity, execution, artifact: bundle, installations, validation, review }; f.recoveryExecution = execution; f.recoveryArtifact = artifact;
  return f;
}
const discover = f => prepareRecoveryHandoff(f.api(), f.root, f.recoveryInput, f.policy);
const resume = (f, handoff) => resumePublication(f.api(), f.root, handoff, digest(json(handoff)), f.policy, f.recoveryExecution, f.privateKey);

for (const stopAt of ["tag", "draft", "asset", "publish"]) test(`recovery after ${stopAt} refusal reuses P/R and existing targets, and writes only missing steps`, async t => now(async () => {
  const f = await newRun(await partial(t, stopAt)), before = f.state.business.length, currentAssets = [...f.state.assets.keys()], originalTag = f.git("tag", "-l") ? f.ref("refs/tags/v0.5.4") : null;
  const handoff = await discover(f); assert.equal(handoff.mode, "recovery");
  const result = await resume(f, handoff);
  assert.equal(result.status, "published"); assert.equal(f.ref("refs/heads/main"), f.identity.production_sha);
  assert.equal(f.state.business.filter(call => call.control.intent.target === "main").length, 1);
  assert.equal(f.state.business.slice(before).some(call => call.control.intent.target === "main"), false);
  if (originalTag) assert.equal(f.ref("refs/tags/v0.5.4"), originalTag);
  for (const id of currentAssets) assert.ok(f.state.assets.has(id));
  assert.equal((await new Control(f.api(), f.rootSha).read()).history.filter(item => item.state.record.type === "receipt").length, 1);
  assert.equal(f.readState().owner, null); assert.equal(f.state.releases[0].immutable, true);
}));

test("already published recovery is read-only and does not mint another App token", async t => now(async () => {
  const f = await newRun(await partial(t, null)), value = await discover(f), before = [f.state.business.length, f.state.appCalls.length];
  const result = await resume(f, value); assert.equal(result.status, "already-published");
  assert.deepEqual([f.state.business.length, f.state.appCalls.length], before);
}));

test("receipt/root/production/history identities are mandatory, including a confirmed exact main write", async t => now(async () => {
  const f = await partial(t), original = { ...f.identity };
  assert.equal(checkHistoricalCandidate(f.root, f.source, f.base, []).development, f.development);
  const unrelatedStable = f.commit(f.git("show", "-s", "--format=%T", f.source), [f.source], "Invalid stable continuation");
  assert.throws(() => checkHistoricalCandidate(f.root, unrelatedStable, f.base, []), /both CHANGELOG/);
  for (const patch of [{ source_sha: f.base }, { base_sha: f.source }, { receipt_sha: f.rootSha }, { control_root: f.source }, { version: "0.5.5" }]) await assert.rejects(inspectRecovery(f.api(), f.root, { ...original, ...patch }, f.policy));
  const clone = f.commit(f.git("show", "-s", "--format=%T", original.production_sha), [f.base], f.git("show", "-s", "--format=%B", original.production_sha));
  f.git("update-ref", "refs/heads/main", clone);
  await assert.rejects(inspectRecovery(f.api(), f.root, original, f.policy), /main/);
  await assert.rejects(inspectRecovery(f.api(), f.root, { ...original, production_sha: clone }, f.policy), /confirmed main/);
  f.git("update-ref", "refs/heads/main", f.base);
  await assert.rejects(inspectRecovery(f.api(), f.root, { ...original, production_sha: f.base }, f.policy));
}));

test("old run/check 404 with current read capability enables complete revalidation; expired artifact alone does not", async t => now(async () => {
  const f = await newRun(await partial(t));
  f.state.artifacts.delete(201); f.state.artifacts.delete(202);
  assert.equal((await discover(f)).mode, "recovery");
  f.state.runs.delete("101/1"); f.state.checks.delete(1006);
  const value = await discover(f); assert.equal(value.mode, "recovery_revalidation"); assert.ok(value.original_ci.unavailable.length >= 2);
  assert.equal((await resume(f, value)).status, "published");
}));

test("missing historical records never mask known failure, skipped jobs, identity conflict or another attempt", async t => now(async () => {
  const f = await newRun(await partial(t)); f.state.runs.delete("101/1");
  const check = f.state.checks.get(1006), saved = structuredClone(check);
  for (const patch of [{ conclusion: "failure" }, { conclusion: "cancelled" }, { conclusion: "skipped" }, { head_sha: f.base }, { id: 999 }]) {
    Object.assign(check, patch); await assert.rejects(discover(f)); Object.assign(check, saved);
  }
  f.state.jobs.get(1).conclusion = "skipped"; await assert.rejects(discover(f), /succeed/);
  assert.equal(f.state.business.filter(call => call.control.intent.target === "main").length, 1);
}));

test("readable historical job and check IDs cannot be masked by unavailable check records", async t => now(async () => {
  const f = await publicationFixture(t), ci = await readPushCI(f.api(), f.original), receipt = { ci, source_sha: f.source, recipe_tool_sha: f.source };
  const job = f.state.jobs.get(ci.job_id), saved = structuredClone(job), route = f.state.route;
  f.state.jobAttempts.set(999, 1);
  for (const status of [404, 410]) {
    f.state.route = async request => {
      if ([`/check-runs/${ci.check_id}`, "/check-runs/1999"].includes(request.path)) { request.reply({}, status); return true; }
      return route(request);
    };
    for (const patch of [{ id: 999 }, { check_run_url: "https://api.github.com/repos/test/repository/check-runs/1999" }]) {
      Object.assign(job, saved, patch);
      await assert.rejects(readHistoricalCI(f.api(), receipt), /contradicts the durable receipt/);
    }
    Object.assign(job, saved);
    const value = await readHistoricalCI(f.api(), receipt);
    assert.equal(value.status, "unavailable"); assert.ok(value.unavailable.every(item => item.status === status));
  }
  assert.equal(f.state.business.length, 0); assert.equal(f.state.appCalls.length, 0);
}));

test("historical permission, rate limit and network ambiguity stop instead of entering revalidation", async t => now(async () => {
  const f = await newRun(await partial(t)), route = f.state.route;
  for (const status of [403, 429, 503, null]) {
    f.state.route = async request => { if (request.path === "/actions/runs/101/attempts/1") { if (status) request.reply({}, status); else request.response.destroy(); return true; } return route(request); };
    await assert.rejects(discover(f), status ? new RegExp(String(status)) : /unknown/);
  }
}));

test("new checks/proof/artifact/review and approval must bind old C/M/P/R rather than current develop", async t => now(async () => {
  const f = await newRun(await partial(t)), value = await discover(f);
  assert.notEqual(f.source, f.recoveryExecution.tool_sha);
  const job = f.state.jobs.get(200); job.conclusion = "failure"; await assert.rejects(discover(f), /succeed/); job.conclusion = "success";
  const check = f.state.checks.get(1200); f.state.checks.delete(1200);
  await assert.rejects(discover(f), /404/); f.state.checks.set(1200, check);
  const proof = JSON.parse((await import("./transport.mjs")).unpackTransport(f.state.artifacts.get(204).bytes, ["recovery-validation.json"]).get("recovery-validation.json"));
  proof.identity.source_sha = f.recoveryExecution.tool_sha;
  const bad = f.recoveryArtifact(205, f.recoveryInput.validation.name, new Map([["recovery-validation.json", json(proof)]]));
  await assert.rejects(prepareRecoveryHandoff(f.api(), f.root, { ...f.recoveryInput, validation: bad }, f.policy), /exact historical/);
  const changed = structuredClone(value); changed.review.tool_commit = f.source; await assert.rejects(resume(f, changed));
  f.state.approvals = []; const count = f.state.appCalls.length; await assert.rejects(resume(f, value), /approval/); assert.equal(f.state.appCalls.length, count);
}));

test("green recovery installation jobs cannot approve an independently supplied artifact or mismatched consumed ZIP", async t => now(async () => {
  const f = await newRun(await partial(t)), state = await inspectRecovery(f.api(), f.root, f.identity, f.policy);
  const before = [f.state.business.length, f.state.appCalls.length], original = structuredClone(f.recoveryInput);
  const rebind = () => { const input = f.recoveryInput; input.validation = f.recoveryArtifact(204, input.validation.name, new Map([["recovery-validation.json", json(recoveryProof(f.api(), input.identity, input.execution, state.candidate, state.recipe, input.artifact, input.installations))]])); };
  f.recoveryInput.artifact = f.recoveryArtifact(205, original.artifact.name, f.built.bundle);
  rebind(); await assert.rejects(discover(f), /consumed artifact/);
  f.recoveryInput = structuredClone(original);
  const proof = installationProof(f.api(), f.recoveryExecution, original.artifact, state.candidate, "windows-latest", 206);
  proof.archive_sha256 = "0".repeat(64);
  f.recoveryInput.installations[0] = f.recoveryArtifact(224, original.installations[0].name, new Map([["installation.json", json(proof)]]));
  rebind(); await assert.rejects(discover(f), /consumed artifact/);
  assert.deepEqual([f.state.business.length, f.state.appCalls.length], before);
}));

test("existing asset/tag/public Release conflicts stop without replacement or new versions", async t => now(async () => {
  const f = await partial(t, "publish"), state = await inspectRecovery(f.api(), f.root, f.identity, f.policy), before = f.state.business.length;
  const release = f.state.releases[0], saved = structuredClone(release);
  for (const draft of [true, false]) {
    for (const patch of [{ body: release.body + "Conflicting release notes.\n" }, { target_commitish: f.base }, { name: "v0.5.5" }, { prerelease: true }]) {
      Object.assign(release, { draft, immutable: !draft }, patch);
      await assert.rejects(inspectRecovery(f.api(), f.root, f.identity, f.policy), /identity or notes conflict/);
      Object.assign(release, saved);
    }
  }
  const asset = f.state.assets.values().next().value, original = Buffer.from(asset.bytes); asset.bytes = Buffer.from("changed");
  await assert.rejects(inspectRecovery(f.api(), f.root, f.identity, f.policy), /asset bytes/); asset.bytes = original;
  f.state.assets.set(999, { id: 999, name: "extra", state: "uploaded", size: 0, bytes: Buffer.alloc(0) });
  await assert.rejects(inspectRecovery(f.api(), f.root, f.identity, f.policy), /assets conflict/); f.state.assets.delete(999);
  f.state.releases[0].draft = false; f.state.releases[0].immutable = true; f.state.assets.delete(asset.id);
  await assert.rejects(inspectRecovery(f.api(), f.root, f.identity, f.policy), /incomplete/);
  f.git("update-ref", "refs/tags/v0.5.4", f.base);
  await assert.rejects(inspectRecovery(f.api(), f.root, f.identity, f.policy), /annotated/);
  assert.equal(f.state.business.length, before); assert.equal(state.targets.missing_assets.length, 0);
}));

test("recovery refuses an asset removed after its publish intent without sending the public request", async t => now(async () => {
  const f = await newRun(await partial(t, "publish")), value = await discover(f), route = f.state.route, before = f.state.business.length;
  let removed = false;
  f.state.route = async request => {
    if (!removed && request.method === "GET" && request.path === "/git/ref/heads/release-control" && f.readState().intent?.target === "publish") {
      removed = f.state.assets.delete(f.state.assets.keys().next().value);
    }
    return route(request);
  };
  await assert.rejects(resume(f, value), /asset set/);
  assert.equal(removed, true); assert.equal(f.state.releases[0].draft, true);
  assert.equal(f.state.business.slice(before).length, 0);
  assert.equal(f.ref("refs/heads/main"), f.identity.production_sha); assert.equal(f.state.assets.size, 2);
  assert.equal(f.state.appCalls.at(-1).method, "DELETE");
}));

test("recovery cross-day keeps original date and unknown write retains owner/intent for explicit reconciliation", async t => now(async () => {
  const f = await newRun(await partial(t)), value = await discover(f); f.state.mode = "unknown";
  await assert.rejects(resume(f, value), /unknown/);
  assert.ok(f.readState().owner); assert.equal(f.readState().intent.target, "tag");
  await assert.rejects(discover(f), /old owner/);
  assert.equal(f.ref("refs/heads/main"), f.identity.production_sha);
}));

test("cross-day recovery only freezes the historical package and performs newly approved missing writes", async t => now(async () => {
  const f = await newRun(await partial(t));
  await atTime("2026-10-26T12:00:00Z", async () => {
    f.state.issued.expires_at = "2026-10-26T13:00:00Z";
    const value = await discover(f); assert.equal(value.receipt.release_date, "2026-10-24");
    assert.equal((await resume(f, value)).status, "published");
  });
  assert.equal(f.ref("refs/heads/main"), f.identity.production_sha);
}));

test("a retired source appearing in delivered production is an invariant conflict, never revived by recovery", async t => now(async () => {
  const f = await partial(t), prior = f.ref("refs/heads/release-control");
  const owner = { run_id: 303, job_id: 333, run_attempt: 1, operation: "retire-candidate", source_sha: f.source, version: "0.5.4", workflow_sha: f.source, tool_sha: f.source, token_expires_at: "2026-10-24T13:00:00Z" };
  const append = (type, data, changes) => {
    const parent = f.ref("refs/heads/release-control"), before = f.readState();
    const state = { ...before, previous_sha: parent, sequence: before.sequence + 1, ...changes, record: { type, data } };
    f.git("update-ref", "refs/heads/release-control", f.dataCommit(state, [parent]));
  };
  append("claim", null, { owner });
  append("retire", { source_sha: f.source, version: "0.5.4", reason: "withdraw", main_sha: f.base }, { retired_sources: [f.source] });
  append("terminal", "retired", { owner: null });
  await assert.rejects(inspectRecovery(f.api(), f.root, f.identity, f.policy), /Retired source/);
  assert.notEqual(f.ref("refs/heads/release-control"), prior); assert.equal(f.ref("refs/heads/main"), f.identity.production_sha);
}));

test("read-only recovery report distinguishes network retry from confirmed conflict and CLI enforces execution", async t => now(async () => {
  const f = await newRun(await partial(t)), value = await discover(f);
  const route = f.state.route;
  f.state.route = async request => { if (request.path === "/git/ref/heads/main") { request.response.destroy(); return true; } return route(request); };
  const report = await recoveryReport(f.api(), f.root, f.identity, f.policy); assert.equal(report.status, "blocked"); assert.equal(report.retry, "read-only-discovery"); assert.equal(report.targets.main.status, "unconfirmed");
  f.state.route = route;
  const env = { ...process.env, FIXTURE_NOW: "2026-10-24T12:00:00Z", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "test/repository", GITHUB_REPOSITORY_ID: "123", GITHUB_TOKEN: "read-fixture-token", GITHUB_REF: "refs/heads/develop", GITHUB_SHA: f.recoveryExecution.tool_sha, GITHUB_WORKFLOW_SHA: f.recoveryExecution.tool_sha, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_JOB: "publish", GITHUB_RUN_ID: "202", GITHUB_RUN_ATTEMPT: "1", RELEASE_POLICY: JSON.stringify(f.policy), RELEASE_HANDOFF: JSON.stringify(value), RELEASE_HANDOFF_SHA256: digest(json(value)), RELEASE_APP_PRIVATE_KEY: f.privateKey };
  const run = (mode, input) => new Promise(resolve => {
    const child = spawn(process.execPath, ["--import", f.preload, fileURLToPath(new URL("../release.mjs", import.meta.url)), mode, "--root", f.root], { cwd: f.root, env: { ...env, RELEASE_INPUT: JSON.stringify(input) } });
    let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data); child.once("close", code => resolve({ code, stdout, stderr }));
  });
  const reportCLI = await run("recovery-report", f.identity); assert.equal(reportCLI.code, 0, reportCLI.stderr);
  const discovered = await run("discover-recovery", f.recoveryInput); assert.equal(discovered.code, 0, discovered.stderr); assert.deepEqual(JSON.parse(discovered.stdout).handoff, value);
  const outcome = () => JSON.parse(readFileSync(join(f.root, ".scratch/ai-agent-release/audit/outcome.json"))), before = f.state.business.length;
  f.state.appFailure = 403; const failed = await run("resume"); assert.equal(failed.code, 1); assert.equal(outcome().approval.run_id, 202); assert.equal(outcome().approval.handoff_sha256, digest(json(value))); assert.equal(outcome().status, "unconfirmed"); assert.equal(f.state.business.length, before); f.state.appFailure = null;
  const result = await run("resume"); assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, "published"); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE KEY|fixture-token/);
  assert.deepEqual(outcome().approval, JSON.parse(result.stdout).approval);
}));

test("blocked recovery reports preserve sequential target observations and partial asset verification", async t => now(async () => {
  const f = await partial(t, "publish"), route = f.state.route, before = [f.state.business.length, f.state.appCalls.length, f.ref("refs/heads/release-control")];
  const release = f.state.releases[0], assets = [...f.state.assets.values()];
  for (const [path, expected] of [
    ["/git/matching-refs/tags/v0.5.4", ["confirmed", "unconfirmed", "unconfirmed", "unconfirmed"]],
    ["/releases", ["confirmed", "confirmed", "unconfirmed", "unconfirmed"]],
    [`/releases/assets/${assets[1].id}`, ["confirmed", "confirmed", "confirmed", "unconfirmed"]],
  ]) {
    f.state.route = async request => { if (request.path === path) { request.response.destroy(); return true; } return route(request); };
    const report = await recoveryReport(f.api(), f.root, f.identity, f.policy);
    assert.equal(report.status, "blocked"); assert.equal(report.retry, "read-only-discovery");
    assert.deepEqual(Object.values(report.targets).map(target => target.status), expected);
    assert.equal(report.targets.main.value, f.identity.production_sha);
    if (path.includes("/assets/")) assert.deepEqual(report.targets.assets.verified.map(asset => asset.id), [assets[0].id]);
  }
  f.state.route = route;
  const body = release.body; release.body += "Conflicting notes.\n";
  const conflict = await recoveryReport(f.api(), f.root, f.identity, f.policy);
  assert.equal(conflict.status, "blocked"); assert.equal(conflict.retry, "resolve-before-retry");
  assert.deepEqual(Object.values(conflict.targets).map(target => target.status), ["confirmed", "confirmed", "conflict", "unconfirmed"]);
  release.body = body; release.draft = false; release.immutable = true;
  f.state.route = async request => { if (request.path === "/releases/latest") { request.response.destroy(); return true; } return route(request); };
  const latest = await recoveryReport(f.api(), f.root, f.identity, f.policy);
  assert.deepEqual(Object.values(latest.targets).map(target => target.status), ["confirmed", "confirmed", "unconfirmed", "confirmed"]);
  assert.equal(latest.targets.assets.verified.length, 3);
  let controlReads = 0;
  f.state.route = async request => { if (request.path === "/git/ref/heads/release-control" && ++controlReads === 2) { request.response.destroy(); return true; } return route(request); };
  const late = await recoveryReport(f.api(), f.root, f.identity, f.policy);
  assert.equal(late.status, "blocked"); assert.equal(late.retry, "read-only-discovery");
  assert.deepEqual(Object.values(late.targets).map(target => target.status), Array(4).fill("confirmed"));
  assert.deepEqual([f.state.business.length, f.state.appCalls.length, f.ref("refs/heads/release-control")], before);
}));
