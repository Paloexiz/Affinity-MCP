import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicationFixture } from "./fixtures/publication.mjs";
import { dispatchEntry, journalWriter } from "./entry.mjs";

async function entryFixture(t) {
  const f = await publicationFixture(t), old = f.state.route;
  const input = { operation: "ci", base_sha: f.development, expected_tool_sha: f.source, entry_id: "a".repeat(32) };
  const state = { calls: [], dispatches: 0, runs: [], direct: "accept", fallback: "accept", admin: true };
  f.state.route = async context => {
    const { method, path, body, reply, response, paged } = context;
    if (path === "" || path === "/actions/workflows/10/dispatches" || path === "/actions/workflows/10/runs" || path === "/actions/runs/501") state.calls.push({ method, path, body, default: f.state.defaultBranch });
    if (method === "GET" && path === "") { reply({ id: 123, full_name: "test/repository", default_branch: f.state.defaultBranch, permissions: { admin: state.admin } }); return true; }
    if (method === "PATCH" && path === "") {
      if (body.default_branch === "main" && state.restoreFailure) { reply({}, 403); return true; }
      f.state.defaultBranch = body.default_branch;
      if (body.default_branch === "develop" && state.changeLost) response.destroy(); else reply({ default_branch: body.default_branch }); return true;
    }
    if (method === "POST" && path === "/actions/workflows/10/dispatches") {
      state.dispatches++; const outcome = state.dispatches === 1 ? state.direct : state.fallback;
      if (Number.isInteger(outcome)) { reply({}, outcome); return true; }
      if (outcome !== "unknown") state.runs.push({ id: 501, workflow_id: 10, repository: { id: 123 }, head_repository: { id: 123 }, event: "workflow_dispatch", head_branch: "develop", head_sha: state.wrongHead ? f.base : f.source, display_title: `CI/CD ${body.inputs.entry_id}`, path: ".github/workflows/docs-hooks.yml" });
      if (state.thirdDefault) f.state.defaultBranch = "another-branch";
      if (["lost", "unknown"].includes(outcome)) response.destroy(); else reply({ workflow_run_id: 501 }); return true;
    }
    if (method === "GET" && path === "/actions/workflows/10/runs") { paged(state.runs, part => ({ total_count: state.runs.length, workflow_runs: part })); return true; }
    if (method === "GET" && path === "/actions/runs/501") { reply(state.runs[0] ?? {}, state.runs.length ? 200 : 404); return true; }
    return old(context);
  };
  const journal = [], run = () => dispatchEntry(f.api(), input, 10, f.rootSha, value => journal.push(structuredClone(value)));
  return Object.assign(f, { entry: state, entryInput: input, journal, run });
}

test("direct accepted or lost-success dispatch is identified read-only with exactly one submission", async t => {
  for (const outcome of ["accept", "lost"]) await t.test(outcome, async t => {
    const f = await entryFixture(t); f.entry.direct = outcome;
    const result = await f.run(); assert.equal(result.status, "confirmed"); assert.equal(result.run.id, 501); assert.equal(result.default_restored, true);
    assert.equal(f.entry.dispatches, 1); assert.equal(f.entry.calls.filter(call => call.method === "PATCH").length, 0);
    assert.equal(f.state.business.length, 0); assert.doesNotMatch(JSON.stringify(f.journal), /fixture-token|authorization/);
  });
});

test("explicit direct rejection permits D2 and restores main before even reading the dispatched run", async t => {
  for (const outcome of ["accept", "lost", "unknown", 403]) await t.test(String(outcome), async t => {
    const f = await entryFixture(t); f.entry.direct = 422; f.entry.fallback = outcome;
    if (["unknown", 403].includes(outcome)) await assert.rejects(f.run()); else assert.equal((await f.run()).run.id, 501);
    assert.equal(f.entry.dispatches, 2); assert.equal(f.state.defaultBranch, "main");
    assert.deepEqual(f.entry.calls.filter(call => call.method === "PATCH").map(call => call.body), [{ default_branch: "develop" }, { default_branch: "main" }]);
    const dispatched = f.entry.calls.findLastIndex(call => call.method === "POST"), after = f.entry.calls.slice(dispatched + 1);
    assert.ok(after.filter(call => call.path.startsWith("/actions/")).every(call => call.default === "main"));
    assert.equal(f.state.business.length, 0);
  });
});

test("uncertain direct dispatch, auth failure, wrong identity and missing administration never trigger the fallback", async t => {
  for (const change of [f => f.entry.direct = "unknown", f => f.entry.direct = 503, f => f.entry.direct = 403, f => f.entry.wrongHead = true, f => f.entry.admin = false, f => f.entryInput.expected_tool_sha = f.base]) await t.test(change.toString(), async t => {
    const f = await entryFixture(t); change(f); await assert.rejects(f.run());
    assert.ok(f.entry.dispatches <= 1); assert.equal(f.entry.calls.filter(call => call.method === "PATCH").length, 0); assert.equal(f.state.defaultBranch, "main");
  });
});

test("D2 change response loss still restores main, but failed restoration and concurrent third default remain blocked", async t => {
  for (const kind of ["changeLost", "restoreFailure", "thirdDefault"]) await t.test(kind, async t => {
    const f = await entryFixture(t); f.entry.direct = 404; f.entry[kind] = true; await assert.rejects(f.run());
    assert.equal(f.journal.at(-1).status, "blocked");
    if (kind === "changeLost") { assert.equal(f.state.defaultBranch, "main"); assert.equal(f.entry.dispatches, 1); }
    if (kind === "restoreFailure") { assert.equal(f.state.defaultBranch, "develop"); assert.equal(f.journal.at(-1).default_restored, false); }
    if (kind === "thirdDefault") { assert.equal(f.state.defaultBranch, "another-branch"); assert.equal(f.entry.calls.filter(call => call.method === "PATCH").length, 1); }
  });
});

test("entry CLI uses only the existing CLI credential, persists exact inputs and refuses journal overwrite", async t => {
  const f = await entryFixture(t), checkout = mkdtempSync(join(tmpdir(), "ai-agent-entry-checkout-")); t.after(() => rmSync(checkout, { recursive: true, force: true }));
  execFileSync("git", ["clone", "--no-hardlinks", f.root, checkout], { stdio: "pipe" }); writeFileSync(join(checkout, ".gitignore"), "/.scratch/\n");
  const input = join(f.root, "input.json"), journal = join(checkout, ".scratch/cicd/materials/entry.json"), credential = join(f.root, "credential.mjs");
  writeFileSync(input, JSON.stringify(f.entryInput));
  writeFileSync(credential, `import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';const original=child.execFileSync;child.execFileSync=(command,args,...rest)=>{if(command==='gh'){if(JSON.stringify(args)!==JSON.stringify(['auth','token','--hostname','github.com']))throw Error('Unexpected credential command');return 'read-fixture-token\\n'}return original(command,args,...rest)};syncBuiltinESMExports();`);
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ["--import", f.preload, "--import", pathToFileURL(credential).href, fileURLToPath(new URL("entry.mjs", import.meta.url)), "--input", input, "--journal", journal, "--repository", "test/repository", "--repository-id", "123", "--workflow-id", "10"], { cwd: checkout, env: process.env });
    let stdout = "", stderr = ""; child.stdout.on("data", data => stdout += data); child.stderr.on("data", data => stderr += data); child.on("close", code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr); assert.deepEqual(JSON.parse(readFileSync(journal)).inputs, f.entryInput); assert.equal(JSON.parse(result.stdout).run.id, 501);
  assert.doesNotMatch(result.stdout + result.stderr + readFileSync(journal), /fixture-token/); assert.throws(() => journalWriter(journal, checkout));
  const common = join(checkout, ".scratch/materials/entry.json"); journalWriter(common, checkout)({ status: "checked" }); assert.deepEqual(JSON.parse(readFileSync(common)), { status: "checked" });
  for (const path of [join(checkout, "ai-agent-journal.json"), join(checkout, "ai-agent-public/entry.json"), join(checkout, ".scratch/cicd/entry.json"), join(f.root, "entry.json")]) { assert.throws(() => journalWriter(path, checkout)); assert.equal(existsSync(path), false); }
  symlinkSync(f.root, join(checkout, ".scratch/cicd/materials/external"), "junction"); assert.throws(() => journalWriter(join(checkout, ".scratch/cicd/materials/external/entry.json"), checkout));
  writeFileSync(join(checkout, ".gitignore"), ""); assert.throws(() => journalWriter(join(checkout, ".scratch/cicd/materials/unignored/entry.json"), checkout));
});
