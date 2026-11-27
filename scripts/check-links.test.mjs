import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLinks } from "./check-links.mjs";

const cli = fileURLToPath(new URL("./check-links.mjs", import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "ai-agent-links-中文 space-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), content); };
  execFileSync("git", ["init", "-q"], { cwd: root });
  write(".gitignore", "/private/\n");
  write("docs/page.md", "# 测试标题\n\n<a id=\"explicit\"></a>\n## Repeat\n## Repeat\n");
  write("README.md", "[章节](docs/page.md#测试标题)\n[dup](docs/page.md#repeat-1)\n[a][ref]\n\n[ref]: docs/page.md#explicit\n<img src=\"assets/中文%20图.png\">\n");
  write("assets/中文 图.png", "image fixture");
  return { root, write, check: () => checkLinks(root, { production: false }) };
}

test("local Markdown, reference links, HTML, encoded spaces and duplicate anchors resolve", t => {
  const f = fixture(t);
  assert.equal(f.check().ok, true);
  f.write("README.md", "[balanced](<docs/a(b).md#one>)\n[inline](docs/a(b).md#one)\n");
  f.write("docs/a(b).md", "# One");
  assert.equal(f.check().ok, true);
});

test("broken target, fragment, ignored file, traversal and absolute paths fail", t => {
  for (const target of ["missing.md", "docs/page.md#missing", "private/data.md", "../outside.md", "/etc/passwd"]) {
    const f = fixture(t); f.write("private/data.md", "private"); f.write("README.md", `[bad](${target})`);
    assert.throws(() => f.check(), /link|ignored|outside|absolute/i, target);
  }
  const f = fixture(t); f.write("README.md", "[missing][absent]\n");
  assert.throws(() => f.check(), /reference/);
});

test("forced tracked ignored resources and symlinks cannot bypass local checks", t => {
  const f = fixture(t); f.write("private/data.md", "private");
  execFileSync("git", ["add", "-f", "private/data.md"], { cwd: f.root });
  f.write("README.md", "[bad](private/data.md)");
  assert.throws(() => f.check(), /ignored/i);
  if (process.platform !== "win32") {
    f.write("README.md", "[bad](link.md)"); symlinkSync("docs/page.md", join(f.root, "link.md"));
    assert.throws(() => f.check(), /symlink/i);
  }
});

test("code examples and external URLs do not become local links", t => {
  const f = fixture(t);
  f.write("README.md", "[official](https://example.invalid/page#x)\n`[example](absent.md)`\n```md\n[example](absent.md)\n```\n<!-- [comment](absent.md) -->");
  assert.equal(f.check().ok, true);
});

test("comment markers inside code cannot hide later active links", t => {
  const f = fixture(t); f.write("README.md", "[page](docs/page.md)");
  for (const prefix of ['```md\n<!--\n```\n-->\n', '<!--\n```md\n-->\n', '`<!--`\n-->\n', '``code `<!--``\n']) {
    f.write("docs/page.md", prefix + "[bad](missing.md)");
    assert.throws(() => f.check(), /Missing local link/, prefix);
  }
  f.write("docs/page.md", "<!--\n[example](missing.md)\n-->\n# Page");
  assert.equal(f.check().ok, true);
});

test("unsupported multiline or unmatched inline code fails instead of hiding links", t => {
  const f = fixture(t); f.write("README.md", "[page](docs/page.md)");
  for (const body of ['`literal\n\n<!-- hidden -->\n[bad](missing.md)\n\n`\n', '`code\na <!--\n`\n[bad](missing.md)\n', '`code\n<!--\n`\n[bad](missing.md)\n', 'An unmatched ` is literal Markdown.']) {
    f.write("docs/page.md", body);
    assert.throws(() => f.check(), /Unmatched or multiline inline code/, body);
  }
});

test("example and commented HTML attributes cannot satisfy a link anchor", t => {
  const f = fixture(t);
  f.write("README.md", "[anchor](docs/page.md#ghost)");
  for (const body of ['```html\n<a id="ghost"></a>\n```', '~~~html\n<a name="ghost"></a>\n~~~', '<!-- <a id="ghost"></a> -->', '`<a id="ghost"></a>`', 'The attribute id="ghost" is an example.', '<a data-id="ghost"></a>']) {
    f.write("docs/page.md", body);
    assert.throws(() => f.check(), /Missing link anchor/, body);
  }
  f.write("docs/page.md", '```md\n```js\n<a id="ghost"></a>\n```');
  assert.throws(() => f.check(), /Missing link anchor/, "a fence with trailing text cannot close a code block");
  f.write("docs/page.md", '<a id="ghost"></a>');
  assert.equal(f.check().ok, true);
  f.write("docs/page.md", "# `ghost`");
  assert.equal(f.check().ok, true, "inline code remains part of heading text");
  f.write("docs/page.md", '```example```\n<a id="ghost"></a>');
  assert.equal(f.check().ok, true, "inline backticks do not start a fenced block");
});

function productionFixture(t) {
  const f = fixture(t);
  const rows = ["README.md", "skills/guide.md", ".gitignore"];
  f.write("README.md", "[rules](docs/versioning.md)\n[guide](skills/guide.md)");
  f.write("skills/guide.md", "# Guide\n");
  f.write("docs/versioning.md", `<a id="production-content"></a>\n## main 分支保留范围\n\n| 用途 | 允许保留的文件 |\n| --- | --- |\n| Files | ${rows.map(x=>`\`${x}\``).join("、")} |\n\n## Other\n`);
  f.write("scripts/production.gitignore", "node_modules/\n");
  f.write("scripts/production-files.json", JSON.stringify(rows.map(path => ({ path, source: path === ".gitignore" ? "scripts/production.gitignore" : path, transform: path === ".gitignore" ? "copy" : path === "README.md" ? "readme" : "copy" }))));
  return f;
}

test("production scope uses the documented set and explicit README conversion only", t => {
  const f = productionFixture(t);
  assert.equal(checkLinks(f.root).productionFiles, 3);
  f.write("skills/guide.md", "[developer doc](../docs/versioning.md)");
  assert.throws(() => checkLinks(f.root), /production/i);
  f.write("skills/guide.md", "[guide](guide.md)\nRun `node scripts/dev.mjs`.\n");
  assert.throws(() => checkLinks(f.root), /production/i);
});

test("production-root CLI checks an unpacked tree and reads links from that tree", t => {
  const f = productionFixture(t);
  const candidate = mkdtempSync(join(tmpdir(), "ai-agent-production-中文 space-"));
  t.after(() => rmSync(candidate, { recursive: true, force: true }));
  const run = () => spawnSync(process.execPath, [cli, "--root", f.root, "--production-root", candidate],
    { cwd: tmpdir(), encoding: "utf8" });
  const rejects = pattern => {
    const result = run();
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, pattern);
  };
  const readme = join(candidate, "README.md");
  mkdirSync(join(candidate, "skills"));
  writeFileSync(readme, "[guide](skills/guide.md#guide)");
  writeFileSync(join(candidate, "skills/guide.md"), "# Guide");
  rejects(/Missing production files: \.gitignore/);
  writeFileSync(join(candidate, ".gitignore"), "local.log\n");
  const ok = run();
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).productionTreeChecked, true);
  writeFileSync(join(candidate, "local.log"), "");
  rejects(/Unexpected production entry: local\.log/);
  rmSync(join(candidate, "local.log"));
  mkdirSync(join(candidate, ".git"));
  rejects(/Unexpected production entry: \.git/);
  rmSync(join(candidate, ".git"), { recursive: true });
  writeFileSync(readme, "[rules](docs/versioning.md)");
  rejects(/Production link requires a development file/);
  writeFileSync(readme, "[guide](skills/guide.md#absent)");
  rejects(/Missing production link anchor/);
  if (process.platform !== "win32") {
    rmSync(readme);
    symlinkSync(join(f.root, "README.md"), readme);
    rejects(/Unexpected production entry: README\.md/);
  }
});

test("allowlist omissions, duplicates, missing template and extra files fail", t => {
  for (const change of ["omit", "duplicate", "missing-template", "extra"]) {
    const f = productionFixture(t);
    const path = join(f.root, "scripts/production-files.json");
    const rows = JSON.parse(readFileSync(path, "utf8"));
    if (change === "omit") rows.pop();
    if (change === "duplicate") rows.push(rows[0]);
    if (change === "extra") rows.push({ path: "extra.md", source: "extra.md", transform: "copy" });
    if (change === "missing-template") rmSync(join(f.root, "scripts/production.gitignore"));
    writeFileSync(path, JSON.stringify(rows));
    assert.throws(() => checkLinks(f.root));
  }
});

test("production changelogs must come from the two generated stable histories", t => {
  const f = productionFixture(t);
  const rows = JSON.parse(readFileSync(join(f.root, "scripts/production-files.json"), "utf8"));
  const candidate = mkdtempSync(join(tmpdir(), "ai-agent-stable-history-"));
  t.after(() => rmSync(candidate, { recursive: true, force: true }));
  const check = () => checkLinks(f.root, { productionRoot: candidate });
  for (const [path, source, title, pending, marker] of [
    ["CHANGELOG.md", "CHANGELOG.release.md", "Affinity MCP Changelog", "Unreleased", "No user-visible changes."],
    ["CHANGELOG.zh-cn.md", "CHANGELOG.release.zh-cn.md", "Affinity MCP 更新日志", "未发布", "无用户可见变更。"],
  ]) {
    const heading = "# " + title + "\n\n";
    const stable = "## 2026-10-01\n\n### 1.0.0\n\n" + marker + "\n";
    rows.push({ path, source, transform: "copy" });
    f.write(path, heading + "## " + pending + "\n\n### 1.0.1-dev.1\n\n" + marker + "\n\n" + stable);
    f.write(source, heading + stable);
    writeFileSync(join(candidate, path), heading + stable);
  }
  f.write("scripts/production-files.json", JSON.stringify(rows));
  f.write("docs/versioning.md", '<a id="production-content"></a>\n## main\n| Files | ' + rows.map(row => "`" + row.path + "`").join("、") + " |\n");
  mkdirSync(join(candidate, "skills"));
  for (const [path, text] of [["README.md", "[guide](skills/guide.md)"], ["skills/guide.md", "# Guide"], [".gitignore", "*.log"]]) {
    writeFileSync(join(candidate, path), text);
  }
  assert.equal(check().productionTreeChecked, true);
  for (const row of rows.filter(row => row.path.startsWith("CHANGELOG"))) {
    writeFileSync(join(candidate, row.path), readFileSync(join(f.root, row.path)));
    assert.throws(check, /Production CHANGELOG.* differs/);
    writeFileSync(join(candidate, row.path), readFileSync(join(f.root, row.source)));
    f.write("scripts/production-files.json", JSON.stringify(rows.map(entry => entry === row ? { ...row, source: row.path } : entry)));
    assert.throws(check, /Unexpected production source mapping/);
    f.write("scripts/production-files.json", JSON.stringify(rows));
  }
});

test("static allowlist checks enforce the same entry schema and transformations as preparation", t => {
  for (const invalid of [{ path: "README.md", source: "README.md", transform: "readme", extra: "x" }, { path: "README.md", source: "README.md", transform: "copy" }, null, []]) {
    const f = productionFixture(t), path = join(f.root, "scripts/production-files.json");
    const entries = JSON.parse(readFileSync(path, "utf8")); entries[0] = invalid;
    writeFileSync(path, JSON.stringify(entries));
    assert.throws(() => checkLinks(f.root), /allowlist entry|production transform/);
  }
});

test("only one visible production section can supply the documented allowlist", t => {
  const f = productionFixture(t);
  const valid = readFileSync(join(f.root, "docs/versioning.md"), "utf8");
  const incomplete = valid.replace("、`.gitignore`", "");
  for (const example of [`\`\`\`md\n${valid}\n\`\`\`\n`, `<!--\n${valid}\n-->\n`]) {
    f.write("docs/versioning.md", example + incomplete);
    assert.throws(() => checkLinks(f.root), /allowlist differs/);
    f.write("docs/versioning.md", example + valid);
    assert.equal(checkLinks(f.root).ok, true);
  }
  f.write("docs/versioning.md", valid + valid);
  assert.throws(() => checkLinks(f.root), /production allowlist/);
});

test("production imports and manifest paths must resolve inside the allowlist", t => {
  const f = productionFixture(t);
  const path = join(f.root, "scripts/production-files.json");
  const rows = JSON.parse(readFileSync(path, "utf8"));
  for (const file of ["skills/runtime.mjs", "plugin.json"]) rows.push({ path: file, source: file, transform: "copy" });
  writeFileSync(path, JSON.stringify(rows));
  f.write("docs/versioning.md", `<a id="production-content"></a>\n## main\n| Files | ${rows.map(x => `\`${x.path}\``).join("、")} |\n`);
  f.write("plugin.json", JSON.stringify({ args: ["./skills/runtime.mjs"] }));
  f.write("skills/runtime.mjs", 'import fs from "node:fs";\n');
  assert.equal(checkLinks(f.root).ok, true);
  f.write("skills/runtime.mjs", 'import "./missing.mjs";\n');
  assert.throws(() => checkLinks(f.root), /import is not packaged/);
  f.write("skills/runtime.mjs", 'import fs from "node:fs";\n');
  f.write("plugin.json", JSON.stringify({ args: ["./scripts/dev.mjs"] }));
  assert.throws(() => checkLinks(f.root), /manifest reference is not packaged/);
});

test("production ignore template matches reviewed bytes and preserves every allowed output", t => {
  const template = readFileSync(new URL("./production.gitignore", import.meta.url), "utf8");
  const expected = ["# Local runtime files; production membership is controlled by the allowlist.", "node_modules/", ".env", ".env.*", "!.env.example", "!.env.sample", "!.env.template", ".DS_Store", "._*", "Thumbs.db", "ehthumbs.db", "desktop.ini", "/.vscode/*", "!/.vscode/extensions.json", "!/.vscode/settings.json", "/.idea/", "*.log", "*.tmp", "*.bak", "*.orig", "*.rej", "*.swp", "*.swo", "*~", "", "# Local agent state; it must never enter the production tree.", "/.serena/", "/.claude/", "/.mimosa/", "/.scratch/"].join("\n") + "\n";
  assert.equal(template, expected, "template changes require review of the expected production bytes");
  const f = fixture(t); f.write(".gitignore", template);
  const allowed = JSON.parse(readFileSync(new URL("./production-files.json", import.meta.url), "utf8")).map(entry => entry.path);
  const check = paths => spawnSync("git", ["check-ignore", "--no-index", "--stdin"], { cwd: f.root, input: paths.join("\n") + "\n", encoding: "utf8" });
  const keep = check([...allowed, ".env.example", ".env.sample", ".env.template"]);
  assert.equal(keep.status, 1, keep.stderr || keep.stdout); assert.equal(keep.stdout, "");
  const local = ["node_modules/example/index.js", ".env", ".env.local", ".DS_Store", "Thumbs.db", "ehthumbs.db", ".vscode/launch.json", ".idea/workspace.xml", "runtime.log", "scratch.tmp", "old.bak", "patch.orig", "conflict.rej", "edit.swp", ".mimosa/hook-state/x.json", ".scratch/docs-hooks/x.json"];
  const ignored = check(local);
  assert.equal(ignored.status, 0, ignored.stderr); assert.deepEqual(ignored.stdout.trim().split(/\r?\n/), local);
});

test("CLI returns real errors and leaves Git state unchanged", t => {
  const f = productionFixture(t);
  const status = () => execFileSync("git", ["status", "--porcelain"], { cwd: f.root, encoding: "utf8" });
  const before = status();
  const run = spawnSync(process.execPath, [cli, "--root", f.root], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).ok, true); assert.equal(status(), before);
  f.write("README.md", "[broken](missing.md)");
  assert.equal(spawnSync(process.execPath, [cli, "--root", f.root]).status, 1);
});
