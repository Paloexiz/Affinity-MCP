import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDelivery, checkSkipInstructions, checkCandidateDelivery } from "./check-delivery.mjs";
import { fixture as apiFixture } from "./release/fixtures/github.mjs";
import { Control } from "./release/control.mjs";

const cli = fileURLToPath(new URL("./check-delivery.mjs", import.meta.url));
const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "ai-agent-delivery-中文 space-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  for (const [key, value] of Object.entries({ "user.name": "Delivery test", "user.email": "test@example.invalid", "commit.gpgSign": "false", "core.hooksPath": ".git/no-hooks" })) git(root, "config", key, value);
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  const version = value => {
    write(".codex-plugin/plugin.json", JSON.stringify({ name: "affinity-mcp", version: value }));
    write(".claude-plugin/plugin.json", JSON.stringify({ name: "affinity-mcp", version: value }));
    write(".claude-plugin/marketplace.json", JSON.stringify({ plugins: [{ name: "affinity-mcp", version: value }] }));
    write("skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs", `const a={clientInfo:{version:"${value}"}}, b={serverInfo:{version:"${value}"}};`);
    write("docs/README.md", `当前仓库清单为插件 \`${value}\``);
    write("docs/architecture.md", `插件标识 \`${value}\``);
    write("docs/sdk/README.md", `| 仓库插件版本 | \`${value}\` |\n| 代理报告版本 | \`${value}\` |\n历史观察：\`0.1.0\``);
    for (const path of ["CHANGELOG.md", "CHANGELOG.zh-cn.md"]) write(path, `## ${value.includes("-dev.") ? "Unreleased" : "2026-10-20"}\n\n### ${value}\n`);
  };
  const commit = (message = "Synthetic delivery") => { git(root, "add", "."); git(root, "commit", "-qm", message); return git(root, "rev-parse", "HEAD"); };
  version("0.5.3"); const stable = commit();
  version("0.5.4-dev.3"); const base = commit();
  return { root, write, read: path => readFileSync(join(root, path), "utf8"), version, commit, base, stable, check: head => checkDelivery(root, { base, head, stable }) };
}

test("ordinary batch checks committed head, permits ordinary edits before the final bump", t => {
  const f = fixture(t);
  f.write("docs/architecture.md", "插件标识 `0.5.4-dev.3`\nOrdinary prose change."); f.commit();
  f.version("0.5.4-dev.4"); const head = f.commit();
  f.version("9.0.0-dev.9"); // Dirty workspace cannot substitute for the reviewed commit.
  const result = f.check(head);
  assert.equal(result.version, "0.5.4-dev.4");
  assert.deepEqual(result.baselines, { base: f.base, head, stable: f.stable });
  const run = spawnSync(process.execPath, [cli, "--root", f.root, "--base", f.base, "--head", head, "--stable", f.stable], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).version, result.version);
});

test("all identity changes belong to the last commit, including change then revert", t => {
  for (const scenario of ["middle", "revert", "one-field"]) {
    const f = fixture(t);
    if (scenario === "one-field") f.write("docs/README.md", "当前仓库清单为插件 `0.5.4-dev.4`");
    else f.version("0.5.4-dev.4");
    f.commit();
    if (scenario === "revert") { f.version("0.5.4-dev.3"); f.commit(); f.version("0.5.4-dev.4"); }
    else if (scenario === "one-field") f.version("0.5.4-dev.4");
    else f.write("extra.md", "Extra content");
    assert.throws(() => f.check(f.commit()), /last commit/, scenario);
  }
});

test("missing bump, jump, rollback, incomplete identity and stable modes fail closed", t => {
  for (const value of ["0.5.4-dev.3", "0.5.4-dev.5", "0.5.4-dev.2", "0.5.4"]) {
    const f = fixture(t); f.version(value); f.write("extra.md", "change");
    assert.throws(() => f.check(f.commit()), /sequence|ordinary development/);
  }
  const f = fixture(t); f.version("0.5.4-dev.4"); f.write("docs/README.md", "当前仓库清单为插件 `0.5.4-dev.3`");
  assert.throws(() => f.check(f.commit()), /mismatch/);
});

test("zero/missing/non-ancestor bases and merged history fail", t => {
  const f = fixture(t); f.version("0.5.4-dev.4"); const head = f.commit();
  for (const base of ["0".repeat(40), "f".repeat(40), "HEAD", head]) assert.throws(() => checkDelivery(f.root, { base, head, stable: f.stable }));
  git(f.root, "checkout", "-q", "--orphan", "unrelated"); f.write("extra.md", "other"); const unrelated = f.commit();
  assert.throws(() => checkDelivery(f.root, { base: unrelated, head, stable: f.stable }), /ancestor/);
  git(f.root, "checkout", "-q", "-b", "branch", f.base); f.write("side.md", "side"); const side = f.commit();
  git(f.root, "checkout", "-q", "--detach", head); git(f.root, "merge", "--no-ff", "-qm", "merge", side);
  assert.throws(() => f.check(git(f.root, "rev-parse", "HEAD")), /linear/);
});

test("unpublished stable candidates cannot reopen development in stage A", t => {
  const f = fixture(t); f.version("0.5.4"); const base = f.commit();
  f.version("0.5.5-dev.1"); const head = f.commit();
  assert.throws(() => checkDelivery(f.root, { base, head, stable: f.stable }), /confirmed production|freeze/);
});

test("skip instructions are rejected in titles and every commit, including trailers", t => {
  for (const text of ["x [skip ci]", "[ci skip]", "[no ci]", "[skip actions]", "[actions skip]", "x\n\nskip-checks: true", "x\n\nskip-checks:true"]) assert.throws(() => checkSkipInstructions(text), /skip/i);
  assert.doesNotThrow(() => checkSkipInstructions("Skip a file; no CI instruction.\n\nskip-checks: false"));
  const f = fixture(t); f.write("extra.md", "test"); f.commit("intermediate [skip ci]"); f.version("0.5.4-dev.4");
  assert.throws(() => f.check(f.commit()), /skip/i);
});

test("missing blob fails without fetching or changing object storage", t => {
  const f = fixture(t); f.version("0.5.4-dev.4"); const head = f.commit();
  const oid = git(f.root, "rev-parse", `${head}:docs/README.md`);
  rmSync(join(f.root, ".git/objects", oid.slice(0, 2), oid.slice(2)));
  const before = git(f.root, "count-objects", "-v");
  assert.throws(() => f.check(head), /objects|Git/);
  assert.equal(git(f.root, "count-objects", "-v"), before);
  assert.equal(git(f.root, "remote"), "");
});

test("gate changes are exposed as an exact diff for human review", t => {
  const f = fixture(t); f.write(".github/workflows/docs-hooks.yml", "name: Changed gate\n"); f.version("0.5.4-dev.4");
  const result = f.check(f.commit());
  assert.ok(result.gateFiles.includes(".github/workflows/docs-hooks.yml"));
  assert.match(result.gateDiff, /Changed gate/);
});

const logPaths = ["CHANGELOG.md", "CHANGELOG.zh-cn.md"];
const entry = (version, date, summary = "Synthetic change.") => "## " + date + "\n\n### " + version + "\n\n#### Changed\n\n- " + summary + "\n\n";
async function candidateFixture(t) {
  const f = fixture(t), remote = await apiFixture(t);
  const history = entry("0.5.4-dev.3", "2026-10-20") + entry("0.5.3", "2026-10-19");
  for (const path of logPaths) f.write(path, history);
  const development = f.commit("Delivered development fixture");
  const set = (version, text) => { f.version(version); for (const path of logPaths) f.write(path, text); };
  const sync = sha => { remote.git("fetch", "-q", f.root, sha); remote.git("update-ref", "refs/heads/develop", sha); };
  remote.git("fetch", "-q", f.root, f.stable); remote.git("update-ref", "refs/heads/main", f.stable);
  const check = async (type, base, head, options = {}) => {
    const count = remote.state.calls.length;
    try { return await checkCandidateDelivery(f.root, { type, event: "pull_request", base, head, stable: f.stable, ...options }, remote.api(), remote.rootSha); }
    finally { assert.ok(remote.state.calls.slice(count).every(call => call.method === "GET"), "candidate checks must stay read-only"); }
  };
  let job = 0;
  const retire = async sha => {
    sync(sha);
    const actor = { ...remote.actor(++job, "retire-candidate"), source_sha: sha };
    const control = new Control(remote.api(), remote.rootSha, actor); await control.claim(); await control.retire("withdraw");
  };
  set("0.5.4", entry("0.5.4", "2026-10-21") + history);
  const promoted = f.commit("Pure promotion");
  return { ...f, remote, history, development, promoted, set, sync, check, retire };
}

test("same-core promotion binds exact event/main/control and permits only fixed fields", async t => {
  const f = await candidateFixture(t); f.sync(f.development);
  const result = await f.check("promote", f.development, f.promoted);
  assert.equal(result.transition.development, f.development);
  f.sync(f.promoted);
  assert.equal((await f.check("promote", f.development, f.promoted, { event: "push" })).version, "0.5.4");
  await assert.rejects(f.check("promote", f.development, f.promoted), /current develop tip/);
  await f.retire(f.promoted);
  await assert.rejects(f.check("promote", f.development, f.promoted, { event: "push" }), /resulting source.*retired/);
  f.sync(f.development);
  await assert.rejects(f.check("promote", f.development, f.promoted, { title: "[skip ci]" }), /skip/);
  for (const scenario of ["core", "prose", "function", "history", "mode", "bom", "order"]) {
    git(f.root, "reset", "--hard", f.promoted);
    if (scenario === "core") f.set("0.6.0", entry("0.6.0", "2026-10-21") + f.history);
    if (scenario === "order") f.set("0.5.4", entry("0.5.4", "2026-10-18") + f.history);
    if (scenario === "prose") f.write("docs/README.md", f.read("docs/README.md") + "\nExtra prose");
    if (scenario === "bom") f.write("docs/README.md", "\uFEFF" + f.read("docs/README.md"));
    if (scenario === "function") f.write("scripts/new.mjs", "export const unexpected = true;\n");
    if (scenario === "history") for (const path of logPaths) f.write(path, f.read(path).replace("2026-10-19", "2026-10-18"));
    if (scenario === "mode") git(f.root, "update-index", "--chmod=+x", ".codex-plugin/plugin.json");
    const head = scenario === "mode" ? (git(f.root, "commit", "-qm", "Mode"), git(f.root, "rev-parse", "HEAD")) : f.commit("Forbidden candidate change");
    // Compare a single final candidate commit so the failure exercises the strict field contract.
    const tree = git(f.root, "show", "-s", "--format=%T", head);
    const candidate = execFileSync("git", ["commit-tree", tree, "-p", f.development, "-m", "Synthetic candidate"], { cwd: f.root, encoding: "utf8" }).trim();
    await assert.rejects(f.check("promote", f.development, candidate), /same core|fixed identity|forbidden|historical|date order/, scenario);
  }
});

test("retired candidate date revisions preserve byte-exact entries and historical ordering", async t => {
  const f = await candidateFixture(t); await f.retire(f.promoted);
  f.set("0.5.4", entry("0.5.4", "2026-10-22") + f.history); const dated = f.commit("Move current entry");
  const result = await f.check("date-revision", f.promoted, dated);
  assert.ok(result.transition.retirement_commit);
  f.sync(dated);
  assert.equal((await f.check("date-revision", f.promoted, dated, { event: "push" })).type, "date-revision");
  await assert.rejects(f.check("date-revision", f.promoted, dated), /current develop tip/);
  await f.retire(dated);
  await assert.rejects(f.check("date-revision", f.promoted, dated, { event: "push" }), /resulting source.*retired/);
  for (const scenario of ["body", "history", "file", "noop", "order"]) {
    git(f.root, "reset", "--hard", f.promoted); f.sync(f.promoted);
    f.set("0.5.4", entry("0.5.4", scenario === "noop" ? "2026-10-21" : "2026-10-22", scenario === "body" ? "Changed summary." : undefined) + (scenario === "history" ? f.history.replace("2026-10-19", "2026-10-18") : f.history));
    if (scenario === "order") f.set("0.5.4", entry("0.5.4", "2026-10-18") + f.history);
    if (scenario === "file") f.write("docs/README.md", f.read("docs/README.md") + "\n");
    const head = scenario === "noop" ? (git(f.root, "commit", "--allow-empty", "-qm", "No date change"), git(f.root, "rev-parse", "HEAD")) : f.commit();
    await assert.rejects(f.check("date-revision", f.promoted, head), /Date revision|forbidden/, scenario);
  }
});

test("withdrawal follows the nearest promotion through date revisions and supports repeated cycles", async t => {
  const f = await candidateFixture(t); await f.retire(f.promoted);
  f.set("0.5.4", entry("0.5.4", "2026-10-22") + f.history); const dated = f.commit("Date revision");
  await f.retire(dated);
  f.write("repair.mjs", "export const fixed = true;\n"); f.commit("Repair before final version");
  f.set("0.5.4-dev.4", entry("0.5.4-dev.4", "Unreleased", "Candidate repair.") + f.history); const withdrawn = f.commit("Withdraw candidate");
  const result = await f.check("withdraw", dated, withdrawn);
  assert.equal(result.transition.promotion, f.promoted); assert.equal(result.transition.development, f.development);
  f.sync(withdrawn);
  assert.equal((await f.check("withdraw", dated, withdrawn, { event: "push" })).version, "0.5.4-dev.4");
  f.set("0.5.4", entry("0.5.4", "2026-10-23", "Repaired release.") + f.history); const promotedAgain = f.commit("Promote repaired candidate");
  assert.equal((await f.check("promote", withdrawn, promotedAgain)).version, "0.5.4");
  await f.retire(promotedAgain);
  for (const value of ["0.5.4-dev.1", "0.5.4-dev.4", "0.5.4-dev.6", "0.5.5-dev.1", "0.5.4-dev.5"]) {
    git(f.root, "reset", "--hard", promotedAgain);
    f.set(value, entry(value, "Unreleased", "Another repair.") + f.history); const head = f.commit("Second withdrawal");
    if (value === "0.5.4-dev.5") assert.equal((await f.check("withdraw", promotedAgain, head)).transition.development, withdrawn);
    else await assert.rejects(f.check("withdraw", promotedAgain, head), /nearest development sequence/, value);
  }
});

test("date revision keeps shared-date historical entries and invalidates the other same-base PR", async t => {
  const f = await candidateFixture(t);
  git(f.root, "reset", "--hard", f.development);
  f.set("0.5.4", entry("0.5.4", "2026-10-20") + f.history.replace(/^## 2026-10-20\n\n/, ""));
  const candidate = f.commit("Promote into shared date group"); f.sync(f.development);
  await f.check("promote", f.development, candidate); await f.retire(candidate);
  f.set("0.5.4", entry("0.5.4", "2026-10-22") + f.history); const first = f.commit("First date PR");
  await f.check("date-revision", candidate, first);
  git(f.root, "reset", "--hard", candidate);
  f.set("0.5.4", entry("0.5.4", "2026-10-23") + f.history); const second = f.commit("Second date PR");
  await f.check("date-revision", candidate, second);
  f.sync(first);
  await assert.rejects(f.check("date-revision", candidate, second), /current develop tip/);
  await assert.rejects(f.check("date-revision", candidate, second, { event: "push" }), /current develop tip/);
});

test("retirement, unissued facts and an idle authentic control chain are mandatory", async t => {
  const f = await candidateFixture(t); f.sync(f.promoted);
  f.set("0.5.4-dev.4", entry("0.5.4-dev.4", "Unreleased") + f.history); const head = f.commit();
  await assert.rejects(f.check("withdraw", f.promoted, head), /permanently retired/);
  await f.retire(f.promoted);
  for (const scenario of ["tag", "release", "main", "unknown", "owner"]) {
    if (scenario === "tag") f.remote.git("update-ref", "refs/tags/v0.5.4", f.promoted);
    if (scenario === "release") f.remote.state.releases.push({ id: 1, tag_name: "v0.5.4", draft: false });
    if (scenario === "main") f.remote.git("update-ref", "refs/heads/main", f.promoted);
    if (scenario === "unknown") f.remote.state.failPath = "/releases";
    if (scenario === "owner") {
      const control = new Control(f.remote.api(), f.remote.rootSha, f.remote.actor(30));
      await control.claim();
    }
    await assert.rejects(f.check("withdraw", f.promoted, head), /delivered|baseline|request|idle|HTTP|formal tag/, scenario);
    if (scenario === "tag") f.remote.git("update-ref", "-d", "refs/tags/v0.5.4");
    f.remote.state.releases = []; f.remote.state.failPath = null;
    f.remote.git("update-ref", "refs/heads/main", f.stable);
  }
});

test("mixed stable history, historical edits, intermediate bumps and missing objects cannot withdraw", async t => {
  const f = await candidateFixture(t); f.write("unexpected.mjs", "// stable mutation\n"); const mixed = f.commit("Mixed stable history");
  await f.retire(mixed);
  f.set("0.5.4-dev.4", entry("0.5.4-dev.4", "Unreleased") + f.history); const mixedHead = f.commit();
  await assert.rejects(f.check("withdraw", mixed, mixedHead), /forbidden/);
  git(f.root, "reset", "--hard", f.promoted); await f.retire(f.promoted);
  f.set("0.5.4-dev.4", entry("0.5.4-dev.4", "Unreleased") + f.history.replace("2026-10-19", "2026-10-18")); const wrongHistory = f.commit();
  await assert.rejects(f.check("withdraw", f.promoted, wrongHistory), /replace only/);
  f.write("extra.md", "Late change"); const late = f.commit();
  await assert.rejects(f.check("withdraw", f.promoted, late), /last commit/);
  const oid = git(f.root, "rev-parse", f.development + ":docs/README.md");
  rmSync(join(f.root, ".git/objects", oid.slice(0, 2), oid.slice(2)));
  await assert.rejects(f.check("withdraw", f.promoted, wrongHistory), /objects|Git/);
});
