import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { transformReadme, buildProduction, prepare, verify, productionTree, productionBundle } from "./production.mjs";
import { decodeZip, encodeZip } from "./archive.mjs";
import { verifyInstall } from "./install.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(root, "scripts/release.mjs");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const write = (root, path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ai-agent-release-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, "repository"); mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", `core.hooksPath=${devNull}`, "-c", "commit.gpgsign=false", ...args], {
    cwd: repo, encoding: "utf8", stdio: "pipe", env: { ...process.env, GIT_AUTHOR_DATE: "2026-10-23T00:00:00Z", GIT_COMMITTER_DATE: "2026-10-23T00:00:00Z" },
  }).trim();
  git("init", "--object-format=sha1"); git("config", "user.name", "Release test"); git("config", "user.email", "release@example.com");
  const version = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"))).version;
  const manifestPaths = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"];
  for (const path of manifestPaths) write(repo, path, readFileSync(join(root, path), "utf8").replaceAll(version, "0.5.3"));
  git("add", "."); git("commit", "-m", "Production base"); const base = git("rev-parse", "HEAD");
  const list = JSON.parse(readFileSync(join(root, "scripts/release/production-files.json")));
  const paths = new Set([...list.map(entry => entry.source), "scripts/release/production-files.json", "docs/README.md", "docs/architecture.md", "docs/sdk/README.md", "docs/versioning.md"]);
  for (const path of paths) write(repo, path, readFileSync(join(root, path)));
  for (const path of [...manifestPaths, "docs/README.md", "docs/architecture.md", "docs/sdk/README.md"]) {
    write(repo, path, readFileSync(join(repo, path), "utf8").replaceAll(version, "0.5.4"));
  }
  write(repo, "CHANGELOG.md", "# Changelog\n\n## 2026-10-24\n\n### 0.5.4\n\n#### Changed\n\n- Synthetic release.\n\n## 2026-10-22\n\n### 0.5.3\n\n#### Fixed\n\n- Previous entry.\n");
  write(repo, "CHANGELOG.zh-cn.md", "# 更新日志\n\n## 2026-10-24\n\n### 0.5.4\n\n#### 变更\n\n- 合成发布。\n\n## 2026-10-22\n\n### 0.5.3\n\n#### 修复\n\n- 历史条目。\n");
  git("add", "."); git("commit", "-m", "Frozen source"); const source = git("rev-parse", "HEAD");
  return { dir, repo, base, source, git, commit: () => { git("add", "."); git("commit", "-m", "Changed source"); return git("rev-parse", "HEAD"); } };
}

test("README recipe matches fixed bilingual historical bytes and preserves new legitimate sections", () => {
  const historical = "33aec1d170d982000c36ceafdc8dfd7f52bcfdff";
  for (const [name, path] of [["en", "README.md"], ["zh", "README.zh-cn.md"]]) {
    const input = readFileSync(new URL(`fixtures/readme-${name}.input.txt`, import.meta.url));
    const expected = readFileSync(new URL(`fixtures/readme-${name}.expected.txt`, import.meta.url));
    assert.deepEqual(transformReadme(path, input, historical), expected);
    const current = Buffer.from("# Package\n\n[Channel](docs/versioning.md).\n\n## Validation\n\nKeep this legitimate paragraph.\n\n## 验证\n\n保留这一段。\n");
    const wanted = Buffer.from(current.toString().replace("docs/versioning.md", `https://github.com/Paloexiz/Affinity-MCP/blob/${historical}/docs/versioning.md`));
    assert.deepEqual(transformReadme(path, current, historical), wanted);
    assert.throws(() => transformReadme(path, Buffer.from("[Missing](docs/other.md)"), historical), /README/);
  }
});

test("manifest and checksums match fixed recipe v1 golden bytes", () => {
  const built = productionBundle([{ path: "a.txt", mode: "100644", bytes: Buffer.from("123456789") }], { source: "1".repeat(40), base: "2".repeat(40), version: "0.5.4", releaseDate: "2026-10-24" });
  assert.deepEqual(built.bundle.get("release-manifest.json"), readFileSync(new URL("fixtures/manifest-v1.json.txt", import.meta.url)));
  assert.deepEqual(built.bundle.get("SHA256SUMS"), readFileSync(new URL("fixtures/SHA256SUMS-v1.txt", import.meta.url)));
  assert.equal(built.summary.production_tree_sha, "ab460c9c5da8318365de716ea1f5b64cf5304bd4");
});

test("prepare CLI freezes Git bytes and produces deterministic three-file bundles with independent ZIP consumption", t => {
  const f = fixture(t), outputs = [join(f.dir, "first"), join(f.dir, "second")];
  const before = f.git("count-objects", "-v");
  const run = (output, env) => {
    const result = spawnSync(process.execPath, [cli, "prepare", "--root", f.repo, "--source-sha", f.source, "--base-sha", f.base, "--output-dir", output], { encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
  };
  const first = run(outputs[0], { TZ: "UTC", LANG: "C" });
  write(f.repo, "README.md", "Dirty working tree must not be read.\r\n");
  const clock = join(f.dir, "clock.mjs");
  writeFileSync(clock, "const OriginalDate = Date; globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2099-12-31T23:59:59Z'])); } static now() { return OriginalDate.parse('2099-12-31T23:59:59Z'); } };\n");
  const second = run(outputs[1], { TZ: "Pacific/Honolulu", LANG: "zh_CN.UTF-8", NODE_OPTIONS: `--import=${pathToFileURL(clock).href}` });
  assert.deepEqual(first, second);
  assert.deepEqual(readdirSync(outputs[0]).sort(), ["SHA256SUMS", "affinity-mcp-0.5.4.zip", "release-manifest.json"]);
  for (const path of readdirSync(outputs[0])) assert.deepEqual(readFileSync(join(outputs[0], path)), readFileSync(join(outputs[1], path)));
  const manifestBytes = readFileSync(join(outputs[0], "release-manifest.json")), manifest = JSON.parse(manifestBytes);
  assert.deepEqual(Object.keys(manifest), ["schema_version", "recipe_version", "version", "release_date", "source_sha", "production_base_sha", "production_tree_sha", "tag", "files", "archive", "verification_scope"]);
  assert.deepEqual(manifestBytes, Buffer.from(JSON.stringify(manifest, null, 2) + "\n"));
  assert.equal(manifest.release_date, "2026-10-24"); assert.equal(manifest.files.length, 28);
  assert.equal(manifest.source_sha, f.source); assert.equal(manifest.production_base_sha, f.base);
  assert.equal(first.archive_sha256, sha(readFileSync(join(outputs[0], manifest.archive.name))));
  assert.equal(first.manifest_sha256, sha(manifestBytes));
  const zipEntries = decodeZip(readFileSync(join(outputs[0], manifest.archive.name)));
  for (const path of ["CHANGELOG.md", "CHANGELOG.zh-cn.md", ".gitattributes"]) {
    assert.deepEqual(zipEntries.find(entry => entry.path === path).bytes, execFileSync("git", ["show", `${f.source}:${path}`], { cwd: f.repo }));
  }
  assert.equal(f.git("count-objects", "-v"), before, "building must not write source objects");
  assert.throws(() => prepare(f.repo, { source: f.source, base: f.base, output: outputs[0] }), /exist/i);
  assert.equal(verify(f.repo, { source: f.source, base: f.base, bundle: outputs[0], expected: first }).production_tree_sha, first.production_tree_sha);
  const verifyArgs = [cli, "verify", "--root", f.repo, "--source-sha", f.source, "--base-sha", f.base, "--bundle-dir", outputs[0], "--tree-sha", first.production_tree_sha, "--archive-sha256", first.archive_sha256, "--manifest-sha256", first.manifest_sha256];
  const verified = spawnSync(process.execPath, verifyArgs, { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr); assert.deepEqual(JSON.parse(verified.stdout), first);
  for (const args of [[cli, "unknown"], [...verifyArgs, "--token", "should-never-be-accepted"], verifyArgs.slice(0, -2)]) assert.notEqual(spawnSync(process.execPath, args).status, 0);
});

test("fixed snapshots reject missing sources, symlinks, gitlinks, extra/mismapped entries, bad versions and missing objects", t => {
  const f = fixture(t);
  assert.throws(() => buildProduction(f.repo, { source: "HEAD", base: f.base }), /full.*SHA/i);
  assert.throws(() => buildProduction(f.repo, { source: "f".repeat(40), base: f.base }), /Git/);
  f.git("update-index", "--cacheinfo", "100755", f.git("hash-object", "README.md"), "README.md");
  f.git("commit", "-m", "Executable source");
  assert.throws(() => buildProduction(f.repo, { source: f.git("rev-parse", "HEAD"), base: f.base }), /mode/);
  f.git("read-tree", f.source);
  f.git("update-index", "--cacheinfo", "120000", f.git("hash-object", "README.md"), "README.md");
  f.git("commit", "-m", "Symlink source");
  assert.throws(() => buildProduction(f.repo, { source: f.git("rev-parse", "HEAD"), base: f.base }), /mode/);
  f.git("read-tree", f.source);
  f.git("update-index", "--cacheinfo", "160000", f.source, "README.md"); f.git("commit", "-m", "Gitlink source");
  assert.throws(() => buildProduction(f.repo, { source: f.git("rev-parse", "HEAD"), base: f.base }), /mode/);
  f.git("read-tree", f.source); f.git("update-index", "--force-remove", "README.md"); f.git("commit", "-m", "Missing source");
  assert.throws(() => buildProduction(f.repo, { source: f.git("rev-parse", "HEAD"), base: f.base }), /Missing/);
  const listPath = "scripts/release/production-files.json", list = JSON.parse(readFileSync(join(f.repo, listPath)));
  write(f.repo, listPath, JSON.stringify([...list, { path: "extra", source: "extra", transform: "copy" }]));
  write(f.repo, "extra", "An extra output must fail even when its source exists.");
  assert.throws(() => buildProduction(f.repo, { source: f.commit(), base: f.base }), /28|allowlist/);
  list[0].source = "README.md"; write(f.repo, listPath, JSON.stringify(list));
  assert.throws(() => buildProduction(f.repo, { source: f.commit(), base: f.base }), /source mapping/);
});

test("replacement refs cannot change frozen commit or blob identities", t => {
  const f = fixture(t), bundle = join(f.dir, "original"), replaced = join(f.dir, "with-replacements");
  const expected = prepare(f.repo, { source: f.source, base: f.base, output: bundle });
  const license = f.git("rev-parse", `${f.source}:LICENSE`);
  write(f.repo, "LICENSE", "Different replacement payload.\n");
  const alternative = f.commit(), replacementBlob = f.git("rev-parse", `${alternative}:LICENSE`);
  f.git("replace", f.source, alternative);
  f.git("replace", license, replacementBlob);
  f.git("replace", f.base, alternative);
  assert.equal(f.git("show", `${f.source}:LICENSE`), "Different replacement payload.", "fixture actually enables Git replacements");
  const before = f.git("count-objects", "-v"), refs = f.git("show-ref");
  assert.deepEqual(prepare(f.repo, { source: f.source, base: f.base, output: replaced }), expected);
  assert.deepEqual(verify(f.repo, { source: f.source, base: f.base, bundle, expected }), expected);
  for (const path of readdirSync(bundle)) assert.deepEqual(readFileSync(join(replaced, path)), readFileSync(join(bundle, path)));
  assert.equal(f.git("count-objects", "-v"), before);
  assert.equal(f.git("show-ref"), refs);
});

test("production ignore rules cannot silently hide an allowed output", t => {
  const f = fixture(t);
  write(f.repo, "scripts/release/production.gitignore", "README.md\n");
  assert.throws(() => buildProduction(f.repo, { source: f.commit(), base: f.base }), /ignores an allowed output/);
});

test("missing frozen blobs fail without fetching or changing the source repository", t => {
  const f = fixture(t), oid = f.git("rev-parse", `${f.source}:assets/affinity-mcp-settings.png`);
  rmSync(join(f.repo, ".git", "objects", oid.slice(0, 2), oid.slice(2)));
  const before = f.git("count-objects", "-v");
  const output = join(f.dir, "must-not-exist");
  assert.throws(() => prepare(f.repo, { source: f.source, base: f.base, output }), /Git/);
  assert.equal(f.git("count-objects", "-v"), before);
  assert.throws(() => readdirSync(output), /ENOENT/);
});

test("ordinary development versions and unsynchronized stable declarations cannot become archives", t => {
  const f = fixture(t), path = ".codex-plugin/plugin.json";
  const original = readFileSync(join(f.repo, path), "utf8");
  write(f.repo, path, original.replace('"0.5.4"', '"0.5.4-dev.1"'));
  assert.throws(() => buildProduction(f.repo, { source: f.commit(), base: f.base }), /stable version/);
  write(f.repo, path, original.replace('"0.5.4"', '"0.5.5"'));
  assert.throws(() => buildProduction(f.repo, { source: f.commit(), base: f.base }), /Version mismatch/);
});

test("a version-consistent package with broken protocol behavior fails actual package smoke", async t => {
  const f = fixture(t), path = "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs";
  const original = readFileSync(join(f.repo, path), "utf8");
  assert.ok(original.includes('const CLIENT_PROTOCOL_VERSION = "2025-11-25"'));
  write(f.repo, path, original.replace('const CLIENT_PROTOCOL_VERSION = "2025-11-25"', 'const CLIENT_PROTOCOL_VERSION = "2000-01-01"'));
  const source = f.commit(), bundle = join(f.dir, "broken-behavior");
  const expected = prepare(f.repo, { source, base: f.base, output: bundle });
  await assert.rejects(verifyInstall(f.repo, { source, base: f.base, bundle, expected }), /Initialization does not match/);
  assert.equal(verify(f.repo, { source, base: f.base, bundle, expected }).archive_sha256, expected.archive_sha256);
});

test("verify rejects self-consistent wrong packages, metadata changes, missing/extra assets and approval mismatch", t => {
  const f = fixture(t), bundle = join(f.dir, "bundle");
  const expected = prepare(f.repo, { source: f.source, base: f.base, output: bundle });
  const options = { source: f.source, base: f.base, bundle, expected };
  const manifestPath = join(bundle, "release-manifest.json"), zipPath = join(bundle, "affinity-mcp-0.5.4.zip"), sumsPath = join(bundle, "SHA256SUMS");
  const original = [zipPath, manifestPath, sumsPath].map(path => readFileSync(path));
  const restore = () => [zipPath, manifestPath, sumsPath].forEach((path, i) => writeFileSync(path, original[i]));
  assert.throws(() => verify(f.repo, { ...options, expected: { ...expected, archive_sha256: "0".repeat(64) } }), /approved/i);
  write(bundle, "extra", "extra"); assert.throws(() => verify(f.repo, options), /assets/); rmSync(join(bundle, "extra"));
  rmSync(sumsPath); assert.throws(() => verify(f.repo, options), /assets/); restore();
  const entries = decodeZip(original[0]); entries.find(entry => entry.path === "LICENSE").bytes = Buffer.from("Wrong but internally consistent.\n");
  const wrongZip = encodeZip(entries), manifest = JSON.parse(original[1]);
  manifest.files.find(entry => entry.path === "LICENSE").sha256 = sha(entries.find(entry => entry.path === "LICENSE").bytes);
  manifest.archive.size = wrongZip.length; manifest.archive.sha256 = sha(wrongZip);
  manifest.production_tree_sha = productionTree(entries);
  const wrongManifest = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(zipPath, wrongZip); writeFileSync(manifestPath, wrongManifest);
  writeFileSync(sumsPath, `${sha(wrongZip)}  affinity-mcp-0.5.4.zip\n${sha(wrongManifest)}  release-manifest.json\n`);
  assert.throws(() => verify(f.repo, { ...options, expected: { ...expected, production_tree_sha: manifest.production_tree_sha, archive_sha256: sha(wrongZip), manifest_sha256: sha(wrongManifest) } }), /source|tree|manifest|archive/i);
  restore(); writeFileSync(manifestPath, Buffer.concat([original[1], Buffer.from(" ")]));
  assert.throws(() => verify(f.repo, options), /manifest/);
});

test("actual ZIP and independently generated main tree run both package-local launchers on a random mock endpoint", async t => {
  const f = fixture(t), bundle = join(f.dir, "bundle");
  const expected = prepare(f.repo, { source: f.source, base: f.base, output: bundle });
  const before = new Map(readdirSync(bundle).map(path => [path, readFileSync(join(bundle, path))]));
  const result = await verifyInstall(f.repo, { source: f.source, base: f.base, bundle, expected });
  assert.equal(result.status, "PASS"); assert.equal(result.production_tree_sha, expected.production_tree_sha);
  assert.equal(result.installations.length, 4);
  assert.deepEqual(result.installations.map(item => [item.origin, item.configuration]), [["zip", "codex"], ["zip", "shared"], ["production-tree", "codex"], ["production-tree", "shared"]]);
  for (const item of result.installations) {
    assert.equal(item.pluginVersion, "0.5.4"); assert.equal(item.tools, 3); assert.equal(item.fallback, false);
    assert.match(item.pluginRoot, /安装 副本/); assert.ok(item.entry.startsWith(item.pluginRoot));
    assert.equal(item.applicationBuild, null); assert.equal(item.applicationPlatform, null);
    assert.deepEqual(item.modifiedFiles, [".codex-plugin/plugin.json", ".mcp.json"]);
    assert.equal(item.onlyEndpointOverridden, true); assert.equal(item.requestCount, 5);
  }
  for (const [path, bytes] of before) assert.deepEqual(readFileSync(join(bundle, path)), bytes);
  assert.throws(() => readFileSync(join(result.installations[0].pluginRoot, "README.md")), /ENOENT/, "temporary installations are removed");
  const { stdout } = await promisify(execFile)(process.execPath, [cli, "verify-install", "--root", f.repo, "--source-sha", f.source, "--base-sha", f.base, "--bundle-dir", bundle, "--tree-sha", expected.production_tree_sha, "--archive-sha256", expected.archive_sha256, "--manifest-sha256", expected.manifest_sha256]);
  assert.equal(JSON.parse(stdout).installations.length, 4);
});
