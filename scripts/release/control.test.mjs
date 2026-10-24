import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Control, genesis, validateHistory, businessWrite, unissuedCandidate, observeIntent } from "./control.mjs";
import { digest, json, GitHub } from "./github.mjs";
import { fixture, atTime } from "./fixtures/github.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const request = (f, after = f.source) => {
  const method = "PATCH", path = "/git/refs/heads/main", body = { sha: after, force: false };
  return { method, path, body, intent: { target: "main", request_sha256: digest(json({ method, path, body })), data: { before_sha: f.base, after_sha: after } } };
};
const send = (control, r) => businessWrite(control, r.intent, r.method, r.path, r.body);
const future = (actor, minutes = 1) => new Date(Date.parse(actor.token_expires_at) + minutes * 60000).toISOString().replace(".000Z", "Z");
function child(f, args, env = {}) {
  const process = spawn(globalThis.process.execPath, ["--import", f.preload, ...args], { cwd: root, env: { ...globalThis.process.env, ...env } });
  let stdout = "", stderr = ""; process.stdout.on("data", chunk => stdout += chunk); process.stderr.on("data", chunk => stderr += chunk);
  const finished = new Promise(resolve => process.once("close", (code, signal) => resolve({ code, signal, stdout, stderr })));
  return { process, finished };
}
function worker(f) {
  const path = join(f.root, "worker.mjs");
  writeFileSync(path, `import {Control,businessWrite} from ${JSON.stringify(pathToFileURL(join(root,"scripts/release/control.mjs")).href)};import {GitHub} from ${JSON.stringify(pathToFileURL(join(root,"scripts/release/github.mjs")).href)};const [root,actor,request]=process.argv.slice(2).map(x=>JSON.parse(x));const api=new GitHub({repository:'test/repository',repositoryId:123,readToken:'read-fixture-token',writeToken:'write-fixture-token'});try{const control=new Control(api,root,actor);await control.claim();if(request)await businessWrite(control,request.intent,request.method,request.path,request.body);console.log(JSON.stringify({owner:actor.job_id}))}catch(error){console.error(error.message);process.exitCode=1}\n`);
  return path;
}
const receipt = f => ({ source_sha: f.source, production_base_sha: f.base, version: "0.5.4", release_date: "2026-10-24", production_tree_sha: f.git("show", "-s", "--format=%T", f.source), recipe_version: "1", recipe_tool_sha: "a".repeat(40), manifest_sha256: "1".repeat(64), archive_sha256: "2".repeat(64), ci: { repository_id: 123, workflow_id: 10, workflow_path: ".github/workflows/docs-hooks.yml", workflow_sha: "b".repeat(40), ref: "refs/heads/develop", head_branch: "develop", head_sha: f.source, event: "push", run_id: 20, run_attempt: 1, job_id: 30, check_id: 40, check_name: "Repository checks / required", check_app_id: 15368, completed_at: "2026-10-24T00:00:00Z", check_set_version: "1", ref_evidence: { run_id: 20, run_attempt: 1, artifact_id: 50, artifact_digest: "3".repeat(64) } } });
function recoveryWorker(f, actor, now) {
  const script = `import {Control} from ${JSON.stringify(pathToFileURL(join(root,"scripts/release/control.mjs")).href)};import {GitHub} from ${JSON.stringify(pathToFileURL(join(root,"scripts/release/github.mjs")).href)};const [root,actor]=JSON.parse(process.argv[1]);const api=new GitHub({repository:'test/repository',repositoryId:123,readToken:'read-fixture-token',writeToken:'write-fixture-token'});try{console.log(JSON.stringify(await new Control(api,root,actor).recover()))}catch(error){console.error(error.message);process.exitCode=1}`;
  return child(f, ["--input-type=module", "-e", script, JSON.stringify([f.rootSha, actor])], { FIXTURE_NOW: now });
}

test("control reader validates pinned repository, genesis, complete single-parent history and exact schema", async t => {
  const f = await fixture(t), read = () => new Control(f.api(), f.rootSha).read();
  const initial = await read(); assert.equal(initial.tip.sha, f.rootSha);
  f.state.repositoryId = 999; await assert.rejects(read(), /identity/); f.state.repositoryId = 123;
  await assert.rejects(new Control(new GitHub({ repository: "fork/repository", repositoryId: 123, readToken: "read-fixture-token" }), f.rootSha).read(), /HTTP 403/);
  const valid = { ...genesis(123, "a".repeat(40)), root_sha: f.rootSha, previous_sha: f.rootSha, sequence: 1, owner: f.actor(), record: { type: "claim", data: null } };
  for (const change of [state => state.schema_version = 2, state => state.repository_id = 321, state => state.previous_sha = "e".repeat(40), state => state.root_sha = "f".repeat(40), state => state.private_key = "must-not-be-a-field", state => state.record.type = "unknown"]) {
    const bad = structuredClone(valid); change(bad); f.git("update-ref", "refs/heads/release-control", f.dataCommit(bad, [f.rootSha])); await assert.rejects(read());
  }
  f.git("update-ref", "refs/heads/release-control", f.dataCommit(valid, [f.rootSha, f.base])); await assert.rejects(read(), /linear/);
  f.git("update-ref", "refs/heads/release-control", f.dataCommit(valid, [])); await assert.rejects(read(), /linear/);
  f.git("update-ref", "refs/heads/release-control", f.rootSha);
  const entries = await f.api().tree((await f.api().commit(f.rootSha)).tree.sha);
  const oid = entries[0].sha; const objectPath = join(f.root, "objects", oid.slice(0, 2), oid.slice(2));
  const saved = readFileSync(objectPath); chmodSync(objectPath, 0o600);
  writeFileSync(objectPath, "corrupt object"); await assert.rejects(read(), /HTTP 404/); writeFileSync(objectPath, saved);
});

test("main intent binds the exact before state and a direct production child", async t => {
  const f = await fixture(t), control = new Control(f.api(), f.rootSha, f.actor()); await control.claim();
  const r = request(f); r.intent.data.before_sha = f.source;
  await assert.rejects(send(control, r), /precondition/);
  const indirect = f.commit(f.git("show", "-s", "--format=%T", f.source), [f.source], "Indirect child");
  await assert.rejects(send(control, request(f, indirect)), /parent/);
  assert.equal(await observeIntent(f.api(), r.intent), null);
  assert.equal(f.state.business.length, 0); assert.equal(f.readState().intent, null);
  const persist = control.intent.bind(control);
  control.intent = async value => { const result = await persist(value); f.git("update-ref", "refs/heads/main", f.source); return result; };
  await assert.rejects(send(control, request(f)), /precondition/);
  assert.equal(f.state.business.length, 0); assert.equal(f.readState().intent, null);
  assert.equal(f.readState().record.data.outcome, "rejected");
  await control.finish("rejected");
});

test("terminal rechecks successful target state and rejects empty completion", async t => {
  const f = await fixture(t), control = new Control(f.api(), f.rootSha, f.actor()); await control.claim();
  await assert.rejects(control.finish("complete"), /successful/);
  await send(control, request(f));
  f.git("update-ref", "refs/heads/main", f.base);
  await assert.rejects(control.finish("complete"), /final state/);
  assert.ok(f.readState().owner); assert.equal(f.readState().intent, null);
  f.git("update-ref", "refs/heads/main", f.source); await control.finish("complete");
  assert.equal(f.readState().owner, null);
});

test("rejected HTTP response lost before durable result remains blocked for a new recovery process", async t => {
  const f = await fixture(t), actor = f.actor(), control = new Control(f.api(), f.rootSha, actor); await control.claim();
  f.state.mode = "reject"; f.state.rejectControlBlob = state => state.record.type === "result";
  await assert.rejects(send(control, request(f)), /HTTP 403/);
  assert.equal(f.state.business.length, 1); assert.ok(f.readState().intent);
  f.state.rejectControlBlob = null; f.state.jobs.get(actor.job_id).status = "completed";
  const recovery = f.actor(2, "control-recover", Date.parse(actor.token_expires_at) + 600000);
  const before = f.ref("refs/heads/release-control"), run = recoveryWorker(f, recovery, future(actor));
  const result = await run.finished; assert.equal(result.code, 1); assert.match(result.stderr, /remains unknown/);
  assert.equal(f.ref("refs/heads/release-control"), before); assert.ok(f.readState().owner); assert.ok(f.readState().intent);
});

test("receipt precedes exact durable request and normal terminal; newly loaded reader sees the same records", async t => {
  const f = await fixture(t), actor = f.actor(), control = new Control(f.api(), f.rootSha, actor);
  await control.claim(); const r = await control.receipt(receipt(f)); assert.equal(f.readState().record.type, "receipt");
  await send(control, request(f)); assert.equal(f.state.business.length, 1);
  assert.equal(f.state.business[0].control.record.type, "intent"); assert.deepEqual(f.state.business[0].control.intent, request(f).intent);
  await control.finish("complete"); const loaded = await new Control(f.api(), f.rootSha).read();
  assert.equal(loaded.tip.state.owner, null); assert.equal(loaded.tip.state.intent, null);
  assert.ok(loaded.history.some(entry => entry.sha === r && entry.state.record.type === "receipt"));
  assert.deepEqual(loaded.history.map(entry => entry.state.record.type), ["genesis", "claim", "receipt", "intent", "result", "terminal"]);
  assert.doesNotMatch(JSON.stringify(loaded), /read-fixture-token|write-fixture-token|authorization|private_key/);
  await assert.rejects(control.claim(), /reclaim/);
  await assert.rejects(new Control(f.api(), f.rootSha, actor).claim(), /reused/);
});

test("two processes compete from the same parent and only the confirmed owner sends business", async t => {
  const f = await fixture(t); f.state.barrierCount = 2;
  const script = worker(f), a = f.actor(1), b = f.actor(2);
  const run = actor => child(f, [script, JSON.stringify(f.rootSha), JSON.stringify(actor), JSON.stringify(request(f))]);
  const children = [run(a), run(b)]; t.after(() => children.forEach(child => child.process.kill()));
  const results = await Promise.all(children.map(child => child.finished));
  assert.deepEqual(results.map(r => r.code).sort(), [0, 1], JSON.stringify(results));
  assert.equal(f.state.business.length, 1); assert.equal(f.ref("refs/heads/main"), f.source);
  const winner = JSON.parse(results.find(r => r.code === 0).stdout).owner;
  assert.equal(f.readState().owner.job_id, winner); assert.equal(f.state.business[0].control.owner.job_id, winner);
});

test("response lost after main success is reconciled without repeating the write", async t => {
  const f = await fixture(t); f.state.mode = "success-lost";
  const control = new Control(f.api(), f.rootSha, f.actor()); await control.claim();
  await send(control, request(f)); await control.finish("complete");
  assert.equal(f.state.business.length, 1); assert.equal(f.readState().intent, null); assert.equal(f.readState().owner, null);
});

test("a documented rejection resolves only the exact request and permits a rejected terminal", async t => {
  const f = await fixture(t); f.state.mode = "reject";
  const control = new Control(f.api(), f.rootSha, f.actor()); await control.claim();
  await assert.rejects(send(control, request(f)), /definitively rejected/);
  assert.equal(f.readState().record.data.outcome, "rejected"); assert.equal(f.readState().record.data.request_sha256, request(f).intent.request_sha256);
  assert.equal(f.readState().intent, null); assert.equal(f.state.business.length, 1); assert.equal(f.ref("refs/heads/main"), f.base);
  await control.finish("rejected"); assert.equal(f.readState().owner, null);
});

test("unknown business result retains owner and intent; additional requests and guard cannot proceed", async t => {
  const f = await fixture(t); f.state.mode = "unknown"; const actor = f.actor(), control = new Control(f.api(), f.rootSha, actor);
  await control.claim(); await assert.rejects(send(control, request(f)), /unknown/);
  assert.ok(f.readState().intent); await assert.rejects(send(control, request(f)), /idle publisher/);
  await assert.rejects(control.finish("complete"), /unresolved/);
  await assert.rejects(new Control(f.api(), f.rootSha, f.actor(2, "retire-candidate")).claim(), /recovery/);
  assert.equal(f.state.business.length, 1);
  const recovery = f.actor(3, "control-recover", Date.parse(actor.token_expires_at) + 600000);
  await atTime(future(actor), async () => {
    await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /termination/);
    f.state.jobs.get(actor.job_id).status = "completed";
    const job = f.state.jobs.get(actor.job_id); f.state.jobs.delete(actor.job_id);
    await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /HTTP 404/); f.state.jobs.set(actor.job_id, job);
    f.state.jobAttempts.set(actor.job_id, 2); await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /attempt/); f.state.jobAttempts.set(actor.job_id, 1);
    f.state.failPath = `/actions/jobs/${actor.job_id}`; await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /HTTP 403/); f.state.failPath = null;
    await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /remains unknown/);
    assert.ok((await new Control(f.api(), f.rootSha).read()).tip.state.intent);
  });
});

test("killed request owner reloads from Git; expiry and cancellation alone cannot erase an in-flight request", async t => {
  const f = await fixture(t), actor = f.actor(), script = worker(f); f.state.mode = "pending";
  const reached = new Promise(resolve => f.state.onBusiness = resolve);
  const process = child(f, [script, JSON.stringify(f.rootSha), JSON.stringify(actor), JSON.stringify(request(f))]); t.after(() => process.process.kill());
  await reached; process.process.kill("SIGKILL"); const exit = await process.finished; assert.equal(exit.signal, "SIGKILL");
  f.state.jobs.get(actor.job_id).status = "completed";
  const recovery = f.actor(2, "control-recover", Date.parse(actor.token_expires_at) + 600000);
  await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /expiry/);
  await atTime(future(actor), async () => {
    await assert.rejects(new Control(f.api(), f.rootSha, recovery).recover(), /unknown/);
    assert.equal(f.state.business.length, 1); f.git("update-ref", "refs/heads/main", f.state.blocked.sha);
    const result = await new Control(f.api(), f.rootSha, recovery).recover(); assert.equal(result.resolution, "exact-success");
    assert.equal((await new Control(f.api(), f.rootSha).read()).tip.state.owner, null); assert.equal(f.state.business.length, 1);
  });
});

test("terminated owner without a pending request can recover but its late update cannot overwrite the successor", async t => {
  const f = await fixture(t), actor = f.actor(), old = new Control(f.api(), f.rootSha, actor); await old.claim();
  const stale = old.current.tip, recovery = f.actor(2, "control-recover", Date.parse(actor.token_expires_at) + 600000);
  f.state.jobs.get(1).status = "completed";
  await atTime(future(actor), async () => {
    const result = await new Control(f.api(), f.rootSha, recovery).recover(); assert.equal(result.resolution, "no-pending-request");
    await assert.rejects(old.intent(request(f).intent), /No live confirmed owner/);
    const candidate = { ...stale.state, previous_sha: stale.sha, sequence: stale.state.sequence + 1, intent: request(f).intent, record: { type: "intent", data: null } };
    const sibling = f.dataCommit(candidate, [stale.sha]);
    await assert.rejects(f.api().request("PATCH", f.api().path + "/git/refs/heads/release-control", { sha: sibling, force: false }), /422/);
    assert.equal(f.ref("refs/heads/release-control"), result.control_sha); assert.equal(f.state.business.length, 0);
  });
});

test("reconciliation accepts only exact tag, draft, downloaded asset and immutable latest publication", async t => {
  const f = await fixture(t), text = "Fixed release notes\n", bodyHash = digest(Buffer.from(text));
  const object = f.gitBytes(["mktag"], `object ${f.source}\ntype commit\ntag v0.5.4\ntagger Release fixture <fixture@example.com> 1792800000 +0000\n\nFixed tag\n`).toString().trim();
  const intent = (target, data) => ({ target, data, request_sha256: "1".repeat(64) });
  const tag = intent("tag", { tag_name: "v0.5.4", object_sha: object, commit_sha: f.source });
  assert.equal(await observeIntent(f.api(), tag), null);
  f.git("update-ref", "refs/tags/v0.5.4", f.source); assert.equal(await observeIntent(f.api(), tag), null);
  f.git("update-ref", "refs/tags/v0.5.4", object); assert.equal((await observeIntent(f.api(), tag)).tag_sha, object);
  const draft = intent("draft", { tag_name: "v0.5.4", commit_sha: f.source, body_sha256: bodyHash });
  const release = { id: 5, tag_name: "v0.5.4", target_commitish: f.source, body: text, prerelease: false, draft: true, immutable: false }; f.state.releases = [release];
  assert.equal((await observeIntent(f.api(), draft)).release_id, 5);
  release.body += "tampered"; assert.equal(await observeIntent(f.api(), draft), null); release.body = text;
  const bytes = Buffer.from("Exact attachment"), asset = intent("asset", { release_id: 5, name: "SHA256SUMS", size: bytes.length, sha256: digest(bytes) });
  f.state.assets.set(6, { id: 6, name: "SHA256SUMS", size: bytes.length, state: "uploaded", bytes });
  assert.equal((await observeIntent(f.api(), asset)).asset_id, 6);
  f.state.assets.get(6).bytes = Buffer.from("Other attachment"); assert.equal(await observeIntent(f.api(), asset), null); f.state.assets.get(6).bytes = bytes;
  f.state.assets.set(7, { ...f.state.assets.get(6), id: 7 }); assert.equal(await observeIntent(f.api(), asset), null);
  const published = intent("publish", { ...draft.data, release_id: 5 });
  assert.equal(await observeIntent(f.api(), published), null); release.draft = false;
  assert.equal(await observeIntent(f.api(), published), null); release.immutable = true;
  assert.equal((await observeIntent(f.api(), published)).release_id, 5);
  f.state.releases.unshift({ id: 8, tag_name: "v0.5.5", draft: false }); assert.equal(await observeIntent(f.api(), published), null);
  f.state.releases.shift(); release.draft = true;
  const control = new Control(f.api(), f.rootSha, f.actor()); await control.claim();
  await control.intent(draft); await control.result("success", await observeIntent(f.api(), draft));
  release.draft = false; await control.intent(published); await control.result("success", await observeIntent(f.api(), published));
  await control.finish("complete"); assert.equal(f.readState().owner, null);
});

test("guard requires neither a package nor PR CI and retirement survives new readers, retries and cancelled PRs", async t => {
  const f = await fixture(t), actor = f.actor(1, "retire-candidate"), control = new Control(f.api(), f.rootSha, actor);
  const beforeMain = f.ref("refs/heads/main"); await control.claim(); const result = await control.retire("withdraw");
  assert.equal(result.status, "retired"); assert.deepEqual(f.readState().retired_sources, [f.source]); assert.equal(f.readState().owner, null);
  assert.equal(f.ref("refs/heads/main"), beforeMain); assert.equal(f.state.business.length, 0);
  assert.ok(f.state.calls.filter(call => call.method !== "GET").every(call => ["/git/blobs", "/git/trees", "/git/commits", "/git/refs/heads/release-control"].includes(call.path)));
  const beforeRetry = f.ref("refs/heads/release-control");
  await assert.rejects(new Control(f.api(), f.rootSha, f.actor(2)).claim(), /Retired/);
  await assert.rejects(new Control(f.api(), f.rootSha, f.actor(3, "retire-candidate")).claim(), /Retired/);
  assert.equal(f.ref("refs/heads/release-control"), beforeRetry); assert.equal(f.readState().owner, null);
  const history = (await new Control(f.api(), f.rootSha).read()).history, removed = structuredClone(history); removed.at(-1).state.retired_sources = [];
  assert.throws(() => validateHistory(removed, { root: f.rootSha, repositoryId: 123 }), /unrelated/);
  assert.deepEqual((await new Control(f.api(), f.rootSha).read()).tip.state.retired_sources, [f.source]);
});

test("guard rejects delivered or unknown targets, wrong tips, wrong versions and unrestored default branch", async t => {
  const f = await fixture(t), run = () => unissuedCandidate(f.api(), f.source, "0.5.4");
  await run(); f.git("update-ref", "refs/heads/main", f.source); await assert.rejects(run(), /delivered/); f.git("update-ref", "refs/heads/main", f.base);
  f.git("update-ref", "refs/tags/v0.5.4", f.source); await assert.rejects(run(), /formal tag/); f.git("update-ref", "-d", "refs/tags/v0.5.4");
  f.state.releases = [{ id: 1, tag_name: "v0.5.4", draft: false }]; await assert.rejects(run(), /public Release/); f.state.releases[0].draft = true; await run();
  f.state.releases[0].draft = null; await assert.rejects(run(), /enumeration/); f.state.releases = [];
  f.state.failPath = "/releases"; await assert.rejects(run(), /HTTP 403/); f.state.failPath = null;
  f.git("update-ref", "refs/heads/develop", f.base); await assert.rejects(run(), /current stable/); f.git("update-ref", "refs/heads/develop", f.source);
  await assert.rejects(unissuedCandidate(f.api(), f.source, "0.6.0"), /current stable/);
  f.state.defaultBranch = "develop"; await assert.rejects(run(), /default branch/); assert.equal(f.ref("refs/heads/release-control"), f.rootSha);
});

test("a fresh recovery protocol process reads persisted ownership and never submits a business request", async t => {
  const f = await fixture(t), actor = f.actor(), old = new Control(f.api(), f.rootSha, actor); await old.claim();
  f.state.jobs.get(actor.job_id).status = "completed";
  const recovery = f.actor(2, "control-recover", Date.parse(actor.token_expires_at) + 600000);
  const result = await recoveryWorker(f, recovery, future(actor)).finished;
  assert.equal(result.code, 0, result.stderr); assert.equal(JSON.parse(result.stdout).resolution, "no-pending-request");
  assert.equal(f.readState().owner, null); assert.equal(f.state.business.length, 0);
  assert.doesNotMatch(result.stdout + result.stderr, /read-fixture-token|write-fixture-token/);
});

test("history capacity is checked before writes and leaves room for the exact operation and terminal", async t => {
  const f = await fixture(t), actor = f.actor(20000), cache = new Map();
  let tip = { sha: f.rootSha, parents: [], state: genesis(123, "a".repeat(40)) }; cache.set(tip.sha, tip);
  // A synthetic complete cached history exercises the bound without creating 10000 OS processes.
  for (let i = 1; i <= 9996; i++) {
    const state = { ...tip.state, root_sha: f.rootSha, previous_sha: tip.sha, sequence: i, owner: i % 2 ? { ...actor, job_id: i, run_id: i + 100 } : null, record: { type: i % 2 ? "claim" : "terminal", data: i % 2 ? null : "rejected" } };
    tip = { sha: i.toString(16).padStart(40, "0"), parents: [tip.sha], state }; cache.set(tip.sha, tip);
  }
  let writes = 0, pendingState; const api = f.api(); api.identity = async () => ({}); api.ref = async () => tip.sha;
  api.request = async (method, path, body) => {
    writes++;
    if (path.endsWith("/git/blobs")) pendingState = JSON.parse(Buffer.from(body.content, "base64"));
    if (path.endsWith("/git/commits")) { const entry = { sha: (20000 + writes).toString(16).padStart(40, "0"), parents: body.parents, state: pendingState }; cache.set(entry.sha, entry); return { sha: entry.sha }; }
    if (path.endsWith("/git/refs/heads/release-control")) tip = cache.get(body.sha);
    return { sha: "e".repeat(40) };
  };
  const create = owner => { const control = new Control(api, f.rootSha, owner); control.objects = cache; return control; };
  await assert.rejects(create(actor).claim(), /capacity/); assert.equal(writes, 0); assert.equal(tip.state.owner, null);
  const guard = create({ ...actor, operation: "retire-candidate" }); await guard.claim();
  await guard.record("retire", { source_sha: f.source, version: actor.version, reason: "withdraw", main_sha: f.base }, { retired_sources: [f.source] });
  await guard.finish("retired"); assert.equal((await create().read()).history.length, 10000); assert.equal(tip.state.owner, null);
  const before = writes; await assert.rejects(create({ ...actor, job_id: 20001 }).claim(), /capacity/); assert.equal(writes, before);
});

test("recovery binds paginated attempt membership without an invented job run_attempt field", async t => {
  const f = await fixture(t), actor = f.actor(999), control = new Control(f.api(), f.rootSha, actor); await control.claim();
  const job = f.state.jobs.get(actor.job_id); job.status = "completed"; f.state.jobs.delete(actor.job_id);
  for (let i = 1; i <= 100; i++) { f.state.jobs.set(i, { id: i, run_id: actor.run_id, status: "completed" }); f.state.jobAttempts.set(i, 1); }
  f.state.jobs.set(actor.job_id, job);
  const recovery = f.actor(1000, "control-recover", Date.parse(actor.token_expires_at) + 600000), run = () => new Control(f.api(), f.rootSha, recovery).recover();
  const before = f.ref("refs/heads/release-control"), path = `/actions/runs/${actor.run_id}/attempts/1/jobs`;
  assert.equal(Object.hasOwn(await f.api().get(`/actions/jobs/${actor.job_id}`), "run_attempt"), false);
  await atTime(future(actor), async () => {
    f.state.failPath = path; await assert.rejects(run(), /HTTP 403/); f.state.failPath = null;
    f.state.jobsResponse = result => ({ ...result, total_count: result.total_count + 1 }); await assert.rejects(run(), /Incomplete/);
    f.state.jobsResponse = result => ({ ...result, jobs: result.jobs.map(item => item.id === actor.job_id ? { ...item, id: 1 } : item) }); await assert.rejects(run(), /Duplicate/);
    f.state.jobsResponse = result => ({ ...result, jobs: result.jobs.map(item => item.id === actor.job_id ? { ...item, run_id: 321 } : item) }); await assert.rejects(run(), /foreign/);
    f.state.jobsResponse = null; f.state.jobAttempts.set(actor.job_id, 2); await assert.rejects(run(), /exact attempt/); f.state.jobAttempts.set(actor.job_id, 1);
    assert.equal(f.ref("refs/heads/release-control"), before);
    f.state.pageSize = 31; f.state.canonicalLinks = true;
    assert.equal((await run()).status, "idle"); assert.equal(f.readState().owner, null);
    assert.ok(f.state.calls.some(call => call.path === path && call.query === "?per_page=100&page=2"));
  });
});

test("guard follows next links on short pages and rejects unsafe or ambiguous pagination", async t => {
  const f = await fixture(t); f.state.pageSize = 1;
  f.state.releases = [{ id: 1, tag_name: "v0.5.3", draft: false }, { id: 2, tag_name: "v0.5.4", draft: false }];
  const guard = () => unissuedCandidate(f.api(), f.source, "0.5.4");
  await assert.rejects(guard(), /public Release/);
  f.state.canonicalLinks = true; await assert.rejects(guard(), /public Release/);
  f.state.releases[1].draft = true; await guard();
  const next = 'https://api.github.com/repos/test/repository/releases?per_page=100&page=2';
  for (const link of [
    `<${next.replace("api.github.com", "example.com")}>; rel="next"`,
    `<${next.replace("test/repository", "foreign/repository")}>; rel="next"`,
    `<${next.replace("page=2", "page=1")}>; rel="next"`,
    `<${next.replace("page=2", "page=3")}>; rel="next"`,
    `<${next.replace("per_page=100", "per_page=1")}>; rel="next"`,
    `<${next}>; rel="next", <${next}>; rel="next"`, "malformed next",
  ]) { f.state.paginationLink = link; await assert.rejects(guard(), /pagination/); }
  assert.equal(f.ref("refs/heads/release-control"), f.rootSha); assert.equal(f.state.business.length, 0);
});

for (const mode of ["success", "success-lost", "unknown", "reject"]) test(`asset upload persists intent before raw HTTP and handles ${mode} without retry`, async t => {
  const f = await fixture(t), control = new Control(f.api(), f.rootSha, f.actor()); await control.claim();
  const body = Buffer.from([0, 255, 13, 10, 128]), method = "POST", path = "/releases/5/assets?name=SHA256SUMS";
  const data = { release_id: 5, name: "SHA256SUMS", size: body.length, sha256: digest(body) };
  const intent = { target: "asset", data, request_sha256: digest(json({ method, path, body: { size: data.size, sha256: data.sha256 } })) };
  const release = { id: 5, draft: true, upload_url: "https://uploads.github.com/repos/test/repository/releases/5/assets{?name,label}" }; f.state.releases = [release];
  const run = () => businessWrite(control, intent, method, path, body);
  if (mode === "success") {
    const before = f.ref("refs/heads/release-control");
    await assert.rejects(businessWrite(control, intent, method, path, Buffer.from("wrong")), /contract/);
    release.upload_url = release.upload_url.replace("uploads.github.com", "example.com"); await assert.rejects(run(), /upload/);
    release.upload_url = release.upload_url.replace("example.com", "uploads.github.com");
    release.draft = false; await assert.rejects(run(), /draft/); release.draft = true;
    assert.equal(f.ref("refs/heads/release-control"), before); assert.equal(f.state.business.length, 0);
  }
  f.state.mode = mode;
  if (["success", "success-lost"].includes(mode)) {
    await run(); assert.deepEqual(f.state.assets.get(1).bytes, body); await control.finish("complete"); assert.equal(f.readState().owner, null);
  } else if (mode === "unknown") {
    await assert.rejects(run(), /unknown/); await assert.rejects(run(), /idle publisher/);
    assert.deepEqual(f.readState().intent, intent); assert.ok(f.readState().owner);
  } else { await assert.rejects(run(), /definitively rejected/); await control.finish("rejected"); }
  assert.equal(f.state.business.length, 1); assert.equal(f.state.business[0].control.record.type, "intent");
  assert.deepEqual(f.state.business[0].control.intent, intent);
  assert.deepEqual(f.state.business[0].body, body);
  assert.equal(f.state.destinations.filter(url => url.startsWith("https://uploads.github.com/")).length, 1);
  assert.ok(f.state.destinations.includes(`https://uploads.github.com/repos/test/repository${path}`));
});
