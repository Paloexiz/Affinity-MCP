import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { crc32, deflateRawSync } from "node:zlib";
import { publicationFixture } from "./fixtures/publication.mjs";
import { atTime } from "./fixtures/github.mjs";
import { digest, json, GitHub } from "./github.mjs";
import { preflight, readPushCI, artifactFiles, readInstallations, installationProof, installPlatforms } from "./evidence.mjs";
import { prepareHandoff, publish, parseProductionMessage, commitMessage, releaseBody, checkDate, daySafetyMs } from "./publication.mjs";
import { installationToken } from "./app.mjs";
import { unpackTransport } from "./transport.mjs";
import { encodeZip } from "./archive.mjs";
import { Control, validateReceipt } from "./control.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const now = work => atTime("2026-10-24T12:00:00Z", work);
const handoff = f => prepareHandoff(f.api(), f.root, f.input, f.policy);
const release = (f, value) => publish(f.api(), f.root, value, digest(json(value)), f.policy, f.execution, f.privateKey);

test("original CI binds the exact push attempt, full-ref artifact and every mandatory job/check", async t => now(async () => {
  const f = await publicationFixture(t); f.state.pageSize = 2; f.state.canonicalLinks = true;
  const ci = await readPushCI(f.api(), f.original);
  assert.equal(ci.ref, "refs/heads/develop"); assert.equal(ci.job_id, 6); assert.equal(ci.check_id, 1006);
  assert.equal(f.state.runs.get("101/1").status, "in_progress", "aggregate success does not wait for the full release run");
  assert.ok(f.state.calls.some(call => call.query?.includes("page=6")));
  const run = f.state.runs.get("101/1"), saved = structuredClone(run);
  for (const patch of [{ event: "workflow_dispatch" }, { head_branch: "other" }, { head_sha: f.base }, { run_attempt: 2 }, { workflow_id: 11 }, { repository: { id: 456 } }]) {
    Object.assign(run, patch); await assert.rejects(readPushCI(f.api(), f.original), /identity/); Object.assign(run, saved);
  }
  await assert.rejects(readPushCI(f.api(), { ...f.original, run_attempt: 2 }), /404/);
  const check = f.state.checks.get(1006), job = f.state.jobs.get(6);
  for (const patch of [{ conclusion: "skipped" }, { status: "queued" }, { app: { id: 2, slug: "github-actions" } }, { check_suite: { id: 222 } }, { name: "lookalike" }]) {
    const old = structuredClone(check); Object.assign(check, patch); await assert.rejects(readPushCI(f.api(), f.original), /check/); Object.assign(check, old);
  }
  job.conclusion = "cancelled"; await assert.rejects(readPushCI(f.api(), f.original), /succeed/); job.conclusion = "success";
  const record = f.state.artifacts.get(201); record.expired = true; await assert.rejects(readPushCI(f.api(), f.original), /Artifact/); record.expired = false;
  f.proof.ref = "refs/tags/develop"; const changed = f.artifact(201, record.name, new Map([["push-ref.json", json(f.proof)]]));
  await assert.rejects(readPushCI(f.api(), { ...f.original, ref_artifact_digest: changed.digest }), /full-ref/);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.state.business.length, 0);
}));

test("preflight rejects missing or weakened readable protection and reports manual-only blind spots", async t => now(async () => {
  const f = await publicationFixture(t), run = () => preflight(f.api(), f.policy);
  assert.ok((await run()).manual_readback_required.includes("administrator-bypass-ui"));
  const probes = [
    [() => f.state.defaultBranch = "develop", () => f.state.defaultBranch = "main"],
    [() => f.state.environment.id++, () => f.state.environment.id--],
    [() => f.state.environment.protection_rules = [], () => f.state.environment.protection_rules = [{ type: "required_reviewers", prevent_self_review: false, reviewers: [{ type: "User", reviewer: { id: 61 } }] }]],
    [() => f.state.branches.push({ id: 2, name: "*", type: "tag" }), () => f.state.branches.pop()],
    [() => f.state.rulesets.get(1).bypass_actors.push({ actor_id: 71, actor_type: "Integration", bypass_mode: "always" }), () => f.state.rulesets.get(1).bypass_actors.pop()],
    [() => f.state.rulesets.get(3).enforcement = "disabled", () => f.state.rulesets.get(3).enforcement = "active"],
  ];
  for (const [change, restore] of probes) { change(); await assert.rejects(run()); restore(); }
  delete f.state.rulesets.get(1).bypass_actors; assert.ok((await run()).manual_readback_required.includes("bypass:develop"));
  f.state.failPath = "/environments/production"; await assert.rejects(run(), /403/);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.state.business.length, 0);
}));

test("handoff cannot substitute the package, independent review, execution or same-run outputs", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f);
  assert.equal(value.release_body, "#### Changed\n\n- Synthetic release.\n");
  assert.equal(value.receipt.production_tree_sha, f.built.summary.production_tree_sha);
  assert.ok(!Object.hasOwn(value.receipt, "production_sha"));
  for (const change of [h => h.artifact.id++, h => h.review.report_sha256 = "x", h => h.review.archive_sha256 = "0".repeat(64), h => h.execution.tool_sha = f.base, h => h.receipt.ci.check_id++, h => h.installation.pop(), h => h.release_body += "Injected notes\n"]) {
    const bad = structuredClone(value); change(bad); await assert.rejects(release(f, bad));
  }
  await assert.rejects(publish(f.api(), f.root, value, "0".repeat(64), f.policy, f.execution, f.privateKey), /digest/);
  f.state.approvals = []; await assert.rejects(release(f, value), /approval/);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.state.business.length, 0);
}));

test("each installation receipt binds its successful job and the exact consumed package artifact", async t => now(async () => {
  const f = await publicationFixture(t), jobs = await f.api().jobs(101, 1);
  const read = input => readInstallations(f.api(), input, f.built.summary, jobs);
  assert.equal((await read(f.input)).length, 3);
  for (const [i, platform] of installPlatforms.entries()) {
    for (const change of [p => p.archive_sha256 = "0".repeat(64), p => p.artifact.id++, p => p.artifact.digest = "0".repeat(64), p => p.job_id++, p => p.execution.run_attempt++]) {
      const proof = structuredClone(installationProof(f.api(), f.execution, f.input.artifact, f.built.summary, platform, 8 + i)); change(proof);
      const binding = f.artifact(301 + i, f.input.installations[i].name, new Map([["installation.json", json(proof)]]));
      const input = structuredClone(f.input); input.installations[i] = binding;
      await assert.rejects(read(input), /consumed artifact/);
    }
  }
  await assert.rejects(read({ ...f.input, installations: f.input.installations.slice(1) }), /Three distinct/);
  await assert.rejects(read({ ...f.input, installations: f.input.installations.toReversed() }), /platform/);
  f.state.artifacts.delete(f.input.installations[0].id); await assert.rejects(handoff(f), /404/);
  assert.equal(f.state.appCalls.length, 0); assert.equal(f.state.business.length, 0);
}));

test("normal publication persists R before P and intent, then verifies exact main/tag/draft/assets/latest", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f), result = await release(f, value);
  assert.equal(result.status, "published"); assert.equal(f.ref("refs/heads/main"), result.production_sha);
  assert.equal(f.ref("refs/tags/v0.5.4^{}"), result.production_sha);
  const history = await new Control(f.api(), f.rootSha).read();
  const receipt = history.history.find(entry => entry.sha === result.receipt_sha);
  assert.deepEqual(receipt.state.record.data, value.receipt);
  assert.deepEqual(f.state.business.map(call => call.control.intent.target), ["main", "tag", "draft", "asset", "asset", "asset", "publish"]);
  assert.ok(f.state.business.every(call => call.control.owner && call.control.intent));
  assert.equal(f.state.business[0].control.previous_sha, result.receipt_sha);
  const message = f.git("show", "-s", "--format=%B", result.production_sha), parsed = parseProductionMessage(message);
  assert.equal(parsed.receipt_sha, result.receipt_sha); assert.equal(parsed.production_tree_sha, f.built.summary.production_tree_sha);
  assert.deepEqual(f.state.releases.map(r => [r.draft, r.prerelease, r.immutable]), [[false, false, true]]);
  assert.equal(f.readState().owner, null); assert.equal(f.state.appCalls.at(-1).method, "DELETE");
  assert.equal(f.state.jwt.iat, Date.parse("2026-10-24T11:59:00Z") / 1000);
  assert.ok(!JSON.stringify(result).includes("fixture-token"));
}));

test("production trailers and receipt preserve a strict golden shape and reject duplicate or conflicting fields", async t => now(async () => {
  const goldenBytes = readFileSync(new URL("fixtures/receipt-v1.json.txt", import.meta.url)), golden = JSON.parse(goldenBytes);
  assert.deepEqual(json(validateReceipt(golden)), goldenBytes);
  assert.equal(commitMessage(golden, "8".repeat(40)), readFileSync(new URL("fixtures/trailers-v1.txt", import.meta.url), "utf8"));
  const f = await publicationFixture(t), value = await handoff(f), receipt = value.receipt, sha = "a".repeat(40), message = commitMessage(receipt, sha);
  assert.deepEqual(parseProductionMessage(message), { version: "0.5.4", release_date: "2026-10-24", source_sha: f.source, production_base_sha: f.base, production_tree_sha: f.built.summary.production_tree_sha, recipe_version: "1", recipe_tool_sha: f.source, manifest_sha256: f.built.summary.manifest_sha256, archive_sha256: f.built.summary.archive_sha256, receipt_sha: sha });
  for (const bad of [message + `CI-Evidence-Commit: ${sha}\n`, message.replace(/CI-Evidence-Commit:.*\n/, ""), message.replace("Release 0.5.4", "Release 0.5.5"), message.replace("Recipe-Version: 1", "Recipe-Version: 2"), message.replace("Release-Date: 2026-10-24", "Release-Date: 2026-02-30"), message.replace("Source-Commit:", "source-commit:")]) assert.throws(() => parseProductionMessage(bad));
  assert.throws(() => commitMessage({ ...receipt, production_sha: sha }, sha), /fields/);
  assert.throws(() => parseProductionMessage(message.replaceAll("0.5.4", "00.5.4")));
  assert.throws(() => releaseBody(Buffer.from("### 0.5.4\n\n### 0.5.4\n"), "0.5.4"));
  assert.equal(releaseBody(Buffer.from("## 2026-10-24\n\n### 0.5.4\n\nNo user-visible changes.\n\n### 0.5.3\n\nOld change.\n"), "0.5.4"), "No user-visible changes.\n");
}));

test("date safety window is fixed and an actual cross-day first write freezes delivery and stops tag creation", async t => {
  assert.equal(daySafetyMs, 120000);
  await atTime("2026-10-24T23:58:00Z", () => assert.throws(() => checkDate("2026-10-24"), /safety/));
  await atTime("2026-10-24T23:57:59Z", () => assert.equal(checkDate("2026-10-24"), "2026-10-24"));
  await atTime("2026-10-24T23:50:00Z", async () => {
    const f = await publicationFixture(t), value = await handoff(f), Original = globalThis.Date;
    f.state.issued.expires_at = "2026-10-25T00:50:00Z";
    f.state.onBusiness = () => { globalThis.Date = class extends Original { constructor(...args) { super(...(args.length ? args : ["2026-10-25T00:00:01Z"])); } static now() { return Original.parse("2026-10-25T00:00:01Z"); } }; };
    try { await assert.rejects(release(f, value), /crossed UTC/); } finally { globalThis.Date = Original; }
    assert.notEqual(f.ref("refs/heads/main"), f.base); assert.equal(f.state.business.length, 1); assert.equal(f.git("tag", "-l"), "");
    assert.equal(f.readState().owner, null); assert.equal(f.readState().record.data, "rejected");
  });
});

test("lost successful responses are read back once; unknown and rejected writes are never replayed", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f); f.state.mode = "success-lost";
  const result = await release(f, value); assert.equal(result.status, "published"); assert.equal(f.state.business.length, 7);
  assert.equal(f.readState().owner, null);
}));

test("cross-day main success with an expired token still reports frozen delivery and retains the unresolved intent", async t => atTime("2026-10-24T23:50:00Z", async () => {
  const f = await publicationFixture(t), value = await handoff(f), Original = globalThis.Date;
  f.state.issued.expires_at = "2026-10-24T23:59:00Z";
  f.state.onBusiness = () => { globalThis.Date = class extends Original { constructor(...args) { super(...(args.length ? args : ["2026-10-25T00:00:01Z"])); } static now() { return Original.parse("2026-10-25T00:00:01Z"); } }; };
  try { await assert.rejects(release(f, value), /crossed UTC/); } finally { globalThis.Date = Original; }
  assert.notEqual(f.ref("refs/heads/main"), f.base); assert.equal(f.state.business.length, 1); assert.equal(f.readState().intent.target, "main"); assert.ok(f.readState().owner);
}));

for (const mode of ["unknown", "reject"]) test(`publication ${mode} failure retains durable facts and performs no subsequent writes`, async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f); f.state.mode = mode;
  await assert.rejects(release(f, value), mode === "unknown" ? /unknown/ : /rejected/);
  assert.equal(f.state.business.length, 1); assert.equal(f.ref("refs/heads/main"), f.base);
  const reloaded = await new Control(f.api(), f.rootSha).read();
  assert.equal(Boolean(reloaded.tip.state.intent), mode === "unknown"); assert.equal(Boolean(reloaded.tip.state.owner), mode === "unknown");
  assert.equal(f.state.appCalls.at(-1).method, "DELETE");
}));

test("App scope, key, expiry and credential failure stop without alternate credentials or business writes", async t => now(async () => {
  const f = await publicationFixture(t);
  await assert.rejects(installationToken(f.api(), f.policy, "private secret value"), /cannot sign/);
  f.state.installation.permissions.actions = "write"; await assert.rejects(installationToken(f.api(), f.policy, f.privateKey), /fields/); delete f.state.installation.permissions.actions;
  f.state.issued.repositories.push({ id: 2 }); await assert.rejects(installationToken(f.api(), f.policy, f.privateKey), /scope/); f.state.issued.repositories.pop();
  f.state.appFailure = 403; const value = await handoff(f); await assert.rejects(release(f, value), /403/);
  assert.equal(f.state.business.length, 0); assert.equal(f.readState().owner, null);
}));

test("draft download conflicts and missing immutability stop without replacing already delivered targets", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f), previous = f.state.route;
  f.state.route = async request => {
    if (request.method === "GET" && request.path === "/releases/301/assets" && f.state.assets.size === 3 && !f.state.extraInserted) {
      f.state.extraInserted = true; f.state.assets.set(99, { id: 99, name: "unexpected.txt", size: 1, bytes: Buffer.from("x"), state: "uploaded" });
    }
    return previous(request);
  };
  await assert.rejects(release(f, value), /asset set/);
  assert.notEqual(f.ref("refs/heads/main"), f.base); assert.equal(f.state.releases[0].draft, true);
  assert.equal(f.state.business.filter(call => call.control.intent.target === "publish").length, 0);
  assert.ok(f.state.assets.has(99));
}));

test("an asset removed after the publish intent prevents the irreversible public request", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f), route = f.state.route;
  let removed = false;
  f.state.route = async request => {
    if (!removed && request.method === "GET" && request.path === "/git/ref/heads/release-control" && f.readState().intent?.target === "publish") {
      removed = f.state.assets.delete(f.state.assets.keys().next().value);
    }
    return route(request);
  };
  await assert.rejects(release(f, value), /asset set/);
  assert.equal(removed, true); assert.equal(f.state.releases[0].draft, true);
  assert.equal(f.state.business.filter(call => call.control.intent.target === "publish").length, 0);
  assert.equal(f.state.assets.size, 2); assert.equal(f.state.appCalls.at(-1).method, "DELETE");
}));

test("public Release without immutable/latest confirmation retains its unresolved publish intent", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f); f.state.notImmutable = true;
  await assert.rejects(release(f, value), /unknown/);
  assert.equal(f.state.releases[0].draft, false); assert.equal(f.readState().intent.target, "publish");
  assert.equal(f.state.business.length, 7); assert.equal(f.state.appCalls.at(-1).method, "DELETE");
}));

test("real publication CLI consumes trusted context and same-run outputs without leaking its App key", async t => now(async () => {
  const f = await publicationFixture(t), value = await handoff(f);
  const env = { ...process.env, FIXTURE_NOW: "2026-10-24T12:00:00Z", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "test/repository", GITHUB_REPOSITORY_ID: "123", GITHUB_TOKEN: "read-fixture-token", GITHUB_REF: "refs/heads/develop", GITHUB_SHA: f.source, GITHUB_WORKFLOW_SHA: f.source, GITHUB_EVENT_NAME: "push", GITHUB_JOB: "publish", GITHUB_RUN_ID: "101", GITHUB_RUN_ATTEMPT: "1", RELEASE_POLICY: JSON.stringify(f.policy), RELEASE_HANDOFF: JSON.stringify(value), RELEASE_HANDOFF_SHA256: digest(json(value)), RELEASE_APP_PRIVATE_KEY: f.privateKey };
  const run = (extra, mode = "publish") => new Promise(resolve => {
    const child = spawn(process.execPath, ["--import", f.preload, join(root, "scripts/release.mjs"), mode, "--root", f.root], { cwd: f.root, env: { ...env, ...extra } });
    let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data); child.once("close", code => resolve({ code, stdout, stderr }));
  });
  const preflightResult = await run({}, "preflight"); assert.equal(preflightResult.code, 0, preflightResult.stderr);
  const discovered = await run({ RELEASE_INPUT: JSON.stringify(f.input) }, "discover"); assert.equal(discovered.code, 0, discovered.stderr); assert.deepEqual(JSON.parse(discovered.stdout).handoff, value);
  const refused = await run({ GITHUB_JOB: "test" }); assert.notEqual(refused.code, 0); assert.match(refused.stderr, /protected/); assert.equal(f.state.appCalls.length, 0);
  const folder = join(f.root, ".scratch/ai-agent-release/audit"), outcome = () => JSON.parse(readFileSync(join(folder, "outcome.json")));
  const previous = f.state.route; let approvalBeforeApp = false;
  f.state.route = async request => { if (request.path === "/installation") approvalBeforeApp = outcome().approval?.handoff_sha256 === digest(json(value)); return previous(request); };
  f.state.appFailure = 403; const credentialFailure = await run({}); assert.equal(credentialFailure.code, 1); assert.equal(approvalBeforeApp, true); assert.equal(outcome().status, "unconfirmed"); assert.equal(outcome().approval.run_id, 101); assert.equal(outcome().approval.job_id, 12); assert.deepEqual(outcome().approval.reviewers, [61]); assert.equal(f.state.business.length, 0);
  f.state.appFailure = null; f.state.route = previous; const approvals = f.state.approvals; f.state.approvals = [];
  assert.equal((await run({})).code, 1); assert.equal(outcome().approval, undefined); f.state.approvals = approvals;
  renameSync(folder, folder + "-saved"); writeFileSync(folder, "Synthetic unavailable audit directory"); const before = f.state.appCalls.length;
  assert.equal((await run({})).code, 1); assert.equal(f.state.appCalls.length, before); assert.equal(f.state.business.length, 0); rmSync(folder); renameSync(folder + "-saved", folder);
  const result = await run({}); assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).status, "published");
  assert.deepEqual(outcome().approval, JSON.parse(result.stdout).approval);
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE KEY|fixture-token/);
}));

test("transport supports Actions deflate/data descriptors but refuses extra, overlapping, corrupt and unbounded payloads", () => {
  const bytes = Buffer.from("Transport fixture"), zip = encodeZip([{ path: "push-ref.json", mode: "100644", bytes }]);
  assert.deepEqual(unpackTransport(zip, ["push-ref.json"]).get("push-ref.json"), bytes);
  const name = Buffer.from("push-ref.json"), packed = deflateRawSync(bytes), local = Buffer.from(zip.subarray(0, 30)), centralOffset = 30 + name.length + bytes.length, central = Buffer.from(zip.subarray(centralOffset, centralOffset + 46)), descriptor = Buffer.alloc(16), end = Buffer.from(zip.subarray(-22));
  local.writeUInt16LE(0x808, 6); local.writeUInt16LE(8, 8); local.fill(0, 14, 26);
  central.writeUInt16LE(0x808, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(packed.length, 20);
  descriptor.writeUInt32LE(0x08074b50); descriptor.writeUInt32LE(crc32(bytes), 4); descriptor.writeUInt32LE(packed.length, 8); descriptor.writeUInt32LE(bytes.length, 12);
  end.writeUInt32LE(30 + name.length + packed.length + 16, 16);
  const deflated = Buffer.concat([local, name, packed, descriptor, central, name, end]);
  assert.deepEqual(unpackTransport(deflated, ["push-ref.json"]).get("push-ref.json"), bytes);
  const wrongCRC = Buffer.from(zip); wrongCRC[30 + name.length] ^= 1;
  for (const invalid of [zip.subarray(0, -1), Buffer.concat([zip, Buffer.from("x")]), wrongCRC]) assert.throws(() => unpackTransport(invalid, ["push-ref.json"]));
  assert.throws(() => unpackTransport(zip, ["unexpected"]));
});
