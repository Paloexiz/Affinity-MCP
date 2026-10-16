import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkIncrement, checkRepository, parseVersion } from "./check-version.mjs";

const cli = fileURLToPath(new URL("./check-version.mjs", import.meta.url));
const proxyPath = "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs";
const legacyProxyPath = "scripts/affinity-mcp-proxy.mjs";
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "affinity-mcp-test-version-中文-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function files(version, layout = proxyPath) {
  return {
    ".codex-plugin/plugin.json": JSON.stringify({ name: "affinity-mcp", version }),
    ".claude-plugin/plugin.json": JSON.stringify({ name: "affinity-mcp", version }),
    ".claude-plugin/marketplace.json": JSON.stringify({ plugins: [{ name: "affinity-mcp", version }] }),
    [layout]: `const a = { clientInfo: { name: "affinity-mcp-proxy", version: "${version}" } };\nconst b = { serverInfo: { name: "affinity-mcp", version: "${version}" } };\n`,
    "docs/README.md": `当前仓库清单为插件 \`${version}\`\n`,
    "docs/architecture.md": `插件标识 \`${version}\`\n`,
    "docs/sdk/README.md": `| 仓库插件版本 | \`${version}\` |\n| 代理报告版本 | \`${version}\` |\n历史观察：\`0.1.10\`\n`,
    "CHANGELOG.md": version.includes("-dev.")
      ? `# Affinity MCP 更新日志\n\n## 未发布\n\n### ${version}\n`
      : `# Affinity MCP 更新日志\n\n## 未发布\n\n## 2026-10-13\n\n### ${version}\n\n#### 修复\n\n- Sample fix.\n`,
  };
}

function write(root, contents) {
  for (const [path, content] of Object.entries(contents)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: "pipe" }).trim();
}

function commit(root, version, layout = proxyPath) {
  write(root, files(version, layout));
  git(root, ["add", "."]);
  git(root, ["-c", "core.hooksPath=.git/affinity-mcp-test-no-hooks", "-c", "user.name=Version test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-m", "Synthetic version snapshot"]);
  return git(root, ["rev-parse", "HEAD"]);
}

test("channel is explicit and repository versions use the chosen SemVer subset", () => {
  for (const version of ["0.1.16-dev.1", "0.1.16-dev.10", "1.0.0-dev.12345678901234567890"]) assert.ok(parseVersion(version, "development"));
  for (const version of ["0.1.16", "0.01.16-dev.1", "0.1.16-dev.0", "0.1.16-dev.01", "0.1.16-beta.1", "0.1.16-dev.1+build", "v0.1.16-dev.1"]) assert.throws(() => parseVersion(version, "development"));
  assert.ok(parseVersion("0.1.15", "stable"));
  assert.throws(() => parseVersion("0.1.16-dev.1", "stable"));
  assert.throws(() => parseVersion("0.1.16-dev.1"));
});

test("same target increments numerically, including beyond nine, without skipped or reused batches", () => {
  for (const [previous, version] of [["0.1.16-dev.9", "0.1.16-dev.10"], ["0.1.16-dev.999999999999999999", "0.1.16-dev.1000000000000000000"]]) {
    assert.doesNotThrow(() => checkIncrement(version, previous, "0.1.15", "development"));
  }
  for (const version of ["0.1.16-dev.9", "0.1.16-dev.8", "0.1.16-dev.11"]) assert.throws(() => checkIncrement(version, "0.1.16-dev.9", "0.1.15", "development"));
});

test("confirmed stable baseline governs legacy migration, target selection and reset", () => {
  assert.doesNotThrow(() => checkIncrement("0.1.16-dev.1", "0.1.14", "0.1.15", "development"));
  assert.doesNotThrow(() => checkIncrement("0.2.0-dev.1", "0.1.16-dev.3", "0.1.15", "development"));
  assert.doesNotThrow(() => checkIncrement("0.1.17-dev.1", "0.1.16-dev.3", "0.1.16", "development"));
  for (const [version, previous, stable] of [
    ["0.1.16-dev.2", "0.1.14", "0.1.15"],
    ["0.1.15-dev.1", "0.1.14", "0.1.15"],
    ["0.1.17-dev.1", "0.1.14", "0.1.15"],
    ["0.2.0-dev.4", "0.1.16-dev.3", "0.1.15"],
    ["0.1.16-dev.1", "0.2.0-dev.3", "0.1.15"],
    ["0.1.16-dev.1", "0.1.17", "0.1.15"],
  ]) assert.throws(() => checkIncrement(version, previous, stable, "development"));
  for (const version of ["0.1.16", "0.2.0", "1.0.0"]) assert.doesNotThrow(() => checkIncrement(version, "0.1.15", undefined, "stable"));
  for (const version of ["0.1.15", "0.1.17", "0.1.14"]) assert.throws(() => checkIncrement(version, "0.1.15", undefined, "stable"));
});

test("static checks reject a single missed declaration at every current identity location", t => {
  const root = fixture(t);
  const current = "0.1.16-dev.1";
  const clean = files(current);
  write(root, clean);
  assert.equal(checkRepository(root, { channel: "development" }).version, current);
  for (const [path, content] of Object.entries(clean)) {
    const occurrences = [...content.matchAll(/0\.1\.16-dev\.1/g)];
    for (const occurrence of occurrences) {
      write(root, clean);
      write(root, { [path]: content.slice(0, occurrence.index) + "0.1.16-dev.2" + content.slice(occurrence.index + current.length) });
      assert.throws(() => checkRepository(root, { channel: "development" }), /Version mismatch/, `${path} occurrence ${occurrence.index}`);
    }
  }
  write(root, clean);
  assert.equal(checkRepository(root, { channel: "development" }).mode, "static", "Historical SDK versions are not replaced or compared");
});

test("static mode needs no Git and CLI requires an explicit channel", t => {
  const root = fixture(t);
  write(root, files("0.1.16-dev.1"));
  const missing = spawnSync(process.execPath, [cli, "--root", root], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Specify channel/);
  assert.equal(missing.stderr.includes(root), false);
  const success = spawnSync(process.execPath, [cli, "--root", root, "--channel", "development"], { encoding: "utf8" });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).mode, "static");
  assert.throws(() => checkRepository(root, { channel: "development", from: "" }), /nonempty commit reference/);
  write(root, { "CHANGELOG.md": "## 未发布\n\n## 日期待核实\n\n### 0.1.16-dev.1\n" });
  assert.throws(() => checkRepository(root, { channel: "development" }), /valid YYYY-MM-DD date/);
});

test("unpublished stable candidates pass both CLI modes and invalid changelog metadata fails", t => {
  const root = fixture(t);
  git(root, ["init", "--quiet"]);
  const baseline = commit(root, "0.1.15");
  const candidate = files("0.1.16");
  candidate["CHANGELOG.md"] = candidate["CHANGELOG.md"].replace("2026-10-13", "2099-12-31");
  write(root, candidate);
  const refs = git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]);
  assert.equal(git(root, ["remote"]), "", "The fixture has no publication remote");
  assert.equal(JSON.parse(git(root, ["show", "HEAD:.codex-plugin/plugin.json"])).version, "0.1.15", "The stable candidate is not committed");
  const run = args => spawnSync(process.execPath, [cli, "--root", root, "--channel", "stable", ...args], { encoding: "utf8" });
  for (const [mode, args] of [["static", []], ["increment", ["--from", baseline]]]) {
    const result = run(args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const expected = { mode, channel: "stable", version: "0.1.16" };
    if (mode === "increment") expected.baselines = { from: { commit: baseline, version: "0.1.15" } };
    assert.deepEqual(JSON.parse(result.stdout), expected, "Successful checks describe candidate metadata, not a publication event");
  }
  const invalid = {
    missing: "# Affinity MCP 更新日志\n\n## 未发布\n\n- Sample fix.\n",
    wrongVersion: candidate["CHANGELOG.md"].replace("### 0.1.16", "### 0.1.17"),
    duplicate: candidate["CHANGELOG.md"] + "\n## 2099-12-31\n\n### 0.1.16\n\n- Duplicate entry.\n",
    invalidDate: candidate["CHANGELOG.md"].replace("2099-12-31", "2099-02-30"),
  };
  for (const [name, changelog] of Object.entries(invalid)) {
    write(root, { "CHANGELOG.md": changelog });
    for (const args of [[], ["--from", baseline]]) {
      const result = run(args);
      assert.equal(result.status, 1, name);
      assert.equal(result.stdout, "", name);
      assert.match(result.stderr, /Stable candidate requires exactly one matching CHANGELOG entry with a valid YYYY-MM-DD date/, name);
      assert.equal(result.stderr.includes(root), false, name);
    }
  }
  for (const changelog of [candidate["CHANGELOG.md"] + "当前开发候选：`0.1.16-dev.1`\n", candidate["CHANGELOG.md"].replace("## 未发布", "## 未发布\n\n### 0.1.16-dev.1")]) {
    write(root, { "CHANGELOG.md": changelog });
    const developmentMarker = run([]);
    assert.equal(developmentMarker.status, 1);
    assert.match(developmentMarker.stderr, /must not retain/);
  }
  write(root, { "CHANGELOG.md": candidate["CHANGELOG.md"] });
  assert.equal(git(root, ["rev-parse", "HEAD"]), baseline);
  assert.equal(git(root, ["for-each-ref", "--format=%(refname) %(objectname)"]), refs);
  assert.equal(git(root, ["remote"]), "");
  t.diagnostic(JSON.stringify({ uncommittedCandidate: true, remotes: 0, staticExit: 0, incrementExit: 0, rejectedInBothModes: Object.keys(invalid), retainedDevelopmentMarkerRejected: true }));
});

test("dated changelog groups bind versions to their own date and retain legacy stable readback", t => {
  const root = fixture(t);
  write(root, files("0.1.16"));
  const sameDay = "# Affinity MCP 更新日志\n\n## 未发布\n\n## 2026-10-13\n\n### 0.1.16\n\n#### 修复\n\n- Sample fix.\n\n### 0.1.15\n\n#### 变更\n\n- Earlier version on the same day.\n";
  for (const changelog of [sameDay, sameDay.replaceAll("\n", "\r\n"), "# Changelog\n\n## [Unreleased]\n\n## [0.1.16] - 2026-10-13\n\n### Fixed\n\n- Legacy published tree.\n"]) {
    write(root, { "CHANGELOG.md": changelog });
    assert.equal(checkRepository(root, { channel: "stable" }).version, "0.1.16");
  }
  for (const changelog of [
    "## 未发布\n\n### 0.1.16\n",
    sameDay.replace("## 2026-10-13", "## 历史源码记录"),
    sameDay.replace("## 2026-10-13", "## 2026-02-30"),
    sameDay + "\n## 2026-10-14\n\n### 0.1.16\n",
    sameDay + "\n## [0.1.16] - 2026-10-14\n",
  ]) {
    write(root, { "CHANGELOG.md": changelog });
    assert.throws(() => checkRepository(root, { channel: "stable" }), /valid YYYY-MM-DD date/);
  }
  write(root, files("0.1.16-dev.1"));
  const development = files("0.1.16-dev.1")["CHANGELOG.md"].replaceAll("\n", "\r\n");
  write(root, { "CHANGELOG.md": development });
  assert.equal(checkRepository(root, { channel: "development" }).version, "0.1.16-dev.1");
  for (const changelog of ["## 未发布\n\n### 0.1.16-dev.1\n\n### 0.1.16-dev.2\n", "## 未发布\n\n## [Unreleased]\n\n### 0.1.16-dev.1\n", "## 未发布\n\n##\t2026-10-13\n\n### 0.1.16-dev.1\n", "## 未发布\n\n##\n\n### 0.1.16-dev.1\n"]) {
    write(root, { "CHANGELOG.md": changelog });
    assert.throws(() => checkRepository(root, { channel: "development" }), /Expected one version declaration|one Unreleased section|valid YYYY-MM-DD date/);
  }
});

test("delivered development snapshots use one dated entry without inventing a pending candidate", t => {
  const root = fixture(t);
  const current = "0.1.16-dev.1";
  write(root, files(current));
  const delivered = `# Affinity MCP 更新日志\n\n## 未发布\n\n## 2026-10-14\n\n### ${current}\n\n#### 变更\n\n- Delivered development changes.\n`;
  write(root, { "CHANGELOG.md": delivered });
  assert.equal(checkRepository(root, { channel: "development" }).version, current);
  const cliResult = spawnSync(process.execPath, [cli, "--root", root, "--channel", "development"], { encoding: "utf8" });
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).mode, "static");
  for (const changelog of [
    delivered.replace("### 0.1.16-dev.1", "### 0.1.16-dev.2"),
    delivered.replace("2026-10-14", "2026-02-30"),
    delivered.replace("## 2026-10-14", "## 日期待核实"),
    delivered + `\n## 2026-10-15\n\n### ${current}\n`,
    delivered.replace("## 未发布", `## 未发布\n\n### ${current}`),
  ]) {
    write(root, { "CHANGELOG.md": changelog });
    assert.throws(() => checkRepository(root, { channel: "development" }), /requires exactly one/);
  }
});

test("increment mode resolves explicit snapshots and rejects missing or inconsistent baselines without raw Git errors", t => {
  const root = fixture(t);
  git(root, ["init", "--quiet"]);
  const previous = commit(root, "0.1.14");
  const stable = commit(root, "0.1.15");
  write(root, files("0.1.16-dev.1"));
  const options = { channel: "development", from: previous, stable };
  const result = checkRepository(root, options);
  assert.deepEqual(result.baselines, { from: { commit: previous, version: "0.1.14" }, stable: { commit: stable, version: "0.1.15" } });
  assert.throws(() => checkRepository(root, { ...options, stable: undefined }), /also requires --stable/);
  const missing = spawnSync(process.execPath, [cli, "--root", root, "--channel", "development", "--from", "missing-private-ref", "--stable", stable], { encoding: "utf8" });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Cannot verify the requested Git baseline locally/);
  assert.equal(missing.stderr.includes(root), false);
  assert.equal(missing.stderr.includes("missing-private-ref"), false);
  assert.equal(missing.stderr.includes("fatal:"), false);
  write(root, { ".claude-plugin/plugin.json": JSON.stringify({ name: "affinity-mcp", version: "0.1.14" }) });
  git(root, ["add", "."]);
  git(root, ["-c", "core.hooksPath=.git/affinity-mcp-test-no-hooks", "-c", "user.name=Version test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-m", "Synthetic inconsistent snapshot"]);
  const inconsistent = git(root, ["rev-parse", "HEAD"]);
  write(root, files("0.1.16-dev.1"));
  assert.throws(() => checkRepository(root, { ...options, from: inconsistent }), /Version mismatch/);
});

test("partial clones fail on missing baseline blobs without fetching or adding local objects", t => {
  for (const layout of [proxyPath, legacyProxyPath]) {
  const root = mkdtempSync(join(tmpdir(), "affinity-mcp-test-version-partial-"));
  try {
    const seed = join(root, "seed");
    const clone = join(root, "clone");
    const tracePath = join(root, "affinity-mcp-test-git-trace.log");
    mkdirSync(seed);
    git(seed, ["init", "--quiet"]);
    git(seed, ["config", "uploadpack.allowFilter", "true"]);
    const baseline = commit(seed, "0.1.15", layout);
    const blob = git(seed, ["rev-parse", `${baseline}:${layout}`]);
    git(root, ["-c", "protocol.file.allow=always", "clone", "--filter=blob:none", "--no-checkout", pathToFileURL(seed).href, clone]);
    write(clone, files("0.1.16-dev.1"));
    assert.equal(git(clone, ["config", "remote.origin.promisor"]), "true");
    for (const path of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
      const bytes = execFileSync("git", ["--no-lazy-fetch", "show", `${baseline}:${path}`], { cwd: seed, stdio: "pipe" });
      const inserted = execFileSync("git", ["--no-lazy-fetch", "hash-object", "-w", "--stdin"], { cwd: clone, input: bytes, encoding: "utf8", stdio: "pipe" }).trim();
      assert.equal(inserted, git(seed, ["rev-parse", `${baseline}:${path}`]));
    }
    const localObjects = () => ({
      packs: readdirSync(join(clone, ".git", "objects", "pack")).sort(),
      ids: git(clone, ["--no-lazy-fetch", "cat-file", "--batch-all-objects", "--batch-check=%(objectname)"]).split(/\r?\n/).sort(),
    });
    const before = localObjects();
    assert.equal(before.ids.includes(blob), false, "The baseline proxy blob is absent before the actual CLI check");
    const result = spawnSync(process.execPath, [cli, "--root", clone, "--channel", "development", "--from", baseline, "--stable", baseline], {
      encoding: "utf8",
      env: { ...process.env, GIT_TRACE: tracePath, GIT_NO_LAZY_FETCH: "0" },
    });
    const trace = readFileSync(tracePath, "utf8");
    const after = localObjects();
    const fetches = [...trace.matchAll(/built-in: git fetch\b/g)].length;
    t.diagnostic(JSON.stringify({ layout, exit: result.status, fetches, packsBefore: before.packs.filter(name => name.endsWith(".pack")).length, packsAfter: after.packs.filter(name => name.endsWith(".pack")).length, objectsBefore: before.ids.length, objectsAfter: after.ids.length }));
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Cannot verify the requested Git baseline locally; confirm the commit and available objects. No fetch was attempted.\n");
    assert.match(trace, /built-in: git (?:rev-parse|show)\b/, "Trace confirms the CLI actually read the baseline");
    assert.ok(trace.includes(`show ${baseline}:${layout}`), "Failure reaches the selected missing proxy blob after all manifests are available");
    assert.equal(fetches, 0);
    assert.deepEqual(after, before, "No pack or local object is added by the failed check");
    assert.equal(result.stderr.includes(root), false);
    assert.equal(result.stderr.includes("fatal:"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  }
});

test("legacy baselines support uncommitted stable CLI candidates and still enforce every package identity", t => {
  for (const layout of [legacyProxyPath, proxyPath]) {
    const root = fixture(t);
    git(root, ["init", "--quiet"]);
    const baseline = commit(root, "0.3.0", layout);
    rmSync(join(root, layout));
    write(root, files("0.4.0"));
    for (const args of [[], ["--from", baseline]]) {
      const result = spawnSync(process.execPath, [cli, "--root", root, "--channel", "stable", ...args], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const actual = JSON.parse(result.stdout);
      assert.equal(actual.version, "0.4.0");
      if (args.length) assert.deepEqual(actual.baselines.from, { commit: baseline, version: "0.3.0" });
    }
    const clean = files("0.3.0", layout);
    for (const path of [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", layout]) {
      for (const occurrence of clean[path].matchAll(/0\.3\.0/g)) {
        rmSync(join(root, proxyPath), { force: true });
        write(root, clean);
        write(root, { [path]: clean[path].slice(0, occurrence.index) + "0.2.0" + clean[path].slice(occurrence.index + "0.3.0".length) });
        git(root, ["add", "."]);
        git(root, ["-c", "core.hooksPath=.git/affinity-mcp-test-no-hooks", "-c", "user.name=Version test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-m", "Synthetic mismatched identity"]);
        const inconsistent = git(root, ["rev-parse", "HEAD"]);
        rmSync(join(root, layout));
        write(root, files("0.4.0"));
        assert.throws(() => checkRepository(root, { channel: "stable", from: inconsistent }), /Version mismatch/, `${layout}: ${path} ${occurrence.index}`);
      }
    }
  }
});

test("zero or two historical proxy paths fail and current files still require the new layout", t => {
  for (const ambiguous of [false, true]) {
    const root = fixture(t);
    git(root, ["init", "--quiet"]);
    commit(root, "0.3.0");
    if (ambiguous) write(root, { [legacyProxyPath]: files("0.3.0")[proxyPath] });
    else rmSync(join(root, proxyPath));
    git(root, ["add", "."]);
    git(root, ["-c", "core.hooksPath=.git/affinity-mcp-test-no-hooks", "-c", "user.name=Version test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "commit", "-m", "Synthetic unsupported layout"]);
    const baseline = git(root, ["rev-parse", "HEAD"]);
    write(root, files("0.4.0"));
    const result = spawnSync(process.execPath, [cli, "--root", root, "--channel", "stable", "--from", baseline], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr, "Git baseline must contain exactly one supported proxy path.\n");
  }
  const root = fixture(t);
  write(root, files("0.4.1-dev.1", legacyProxyPath));
  assert.throws(() => checkRepository(root, { channel: "development" }), /Cannot read required file: skills\/affinity-mcp\/scripts\/affinity-mcp-proxy\.mjs/);
});
