import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildReleaseChangelogs } from "./build-release-changelog.mjs";

const english = `# Affinity MCP Changelog

English | [简体中文](CHANGELOG.zh-cn.md)

## Unreleased

### 1.1.0-dev.2

#### Fixed

- Pending fix.

## 2026-10-12

### 1.1.0-dev.1

No user-visible changes.

## 2026-10-11

### 1.0.1

#### Fixed

- Preserve text when saving.

### 1.0.1-dev.1

#### Changed

- Superseded development wording.

### 1.0.0

No user-visible changes.
`;
const chinese = english.replace("Affinity MCP Changelog", "Affinity MCP 更新日志").replace("Unreleased", "未发布")
  .replaceAll("#### Fixed", "#### 修复").replace("#### Changed", "#### 变更")
  .replaceAll("No user-visible changes.", "无用户可见变更。").replace("Preserve text when saving.", "保存时保留文字。");
const cli = fileURLToPath(new URL("./build-release-changelog.mjs", import.meta.url));

test("generate and check stable histories, preserving same-day releases and excluding development-only dates", t => {
  const root = mkdtempSync(join(tmpdir(), "ai-agent-changelog-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, content) => writeFileSync(join(root, path), content);
  const read = path => readFileSync(join(root, path), "utf8");
  const run = (...args) => spawnSync(process.execPath, [cli, "--root", root, ...args], { encoding: "utf8" });
  write("CHANGELOG.md", english);
  write("CHANGELOG.zh-cn.md", chinese.replaceAll("\n", "\r\n"));
  const generated = run();
  assert.equal(generated.status, 0, generated.stderr);
  const expected = "# Affinity MCP Changelog\n\n## 2026-10-11\n\n### 1.0.1\n\n#### Fixed\n\n- Preserve text when saving.\n\n### 1.0.0\n\nNo user-visible changes.\n";
  assert.equal(read("CHANGELOG.release.md"), expected);
  assert.equal(read("CHANGELOG.release.zh-cn.md"), expected.replace("Affinity MCP Changelog", "Affinity MCP 更新日志")
    .replace("Fixed", "修复").replace("Preserve text when saving.", "保存时保留文字。").replace("No user-visible changes.", "无用户可见变更。"));
  assert.equal(run("--check").status, 0);
  write("CHANGELOG.release.md", "stale");
  assert.equal(run("--check").status, 1);
  assert.equal(read("CHANGELOG.release.md"), "stale", "Check mode leaves stale outputs untouched");
  write("CHANGELOG.zh-cn.md", chinese.replace("#### 修复\n\n- 保存时保留文字。", "#### 修复"));
  assert.equal(run().status, 1);
  assert.equal(read("CHANGELOG.release.md"), "stale", "Validate both sources before replacing either output");
});

test("reject empty or ambiguous stable summaries even when both languages have the same structure", () => {
  for (const [before, after] of [
    ["2026-10-11", "2026-02-30"],
    ["2026-10-11", "2026-10-13"],
    ["### 1.0.0", "### 1.0.1"],
    ["### 1.1.0-dev.2", "### 1.1.0"],
    ["- Preserve text when saving.", ""],
    ["No user-visible changes.\n", "No user-visible changes.\n\n#### Changed\n\n- Extra."],
  ]) {
    const localized = value => value.replaceAll("No user-visible changes.", "无用户可见变更。")
      .replace("#### Changed", "#### 变更").replace("Preserve text when saving.", "保存时保留文字。");
    const drafts = new Map([["CHANGELOG.md", english.replaceAll(before, after)],
      ["CHANGELOG.zh-cn.md", chinese.replaceAll(localized(before), localized(after))]]);
    assert.throws(() => buildReleaseChangelogs(path => drafts.get(path)));
  }
});

test("reject a version before the first date group and a no-change marker mixed with development entries", () => {
  const beforeGroup = text => text.replace(/^## /m, "### 0.9.0\n\n## ");
  const mixed = text => text.replace("### 1.1.0-dev.2\n", "### 1.1.0-dev.2\n\n" +
    (text === english ? "No user-visible changes." : "无用户可见变更。") + "\n");
  for (const change of [beforeGroup, mixed]) {
    assert.throws(() => buildReleaseChangelogs(path => change(path === "CHANGELOG.md" ? english : chinese)),
      /outside a date group|invalid CHANGELOG summary/);
  }
});

test("both full histories explain a no-change release after user-visible development work", () => {
  const en = english.replace("#### Fixed\n\n- Preserve text when saving.", "No user-visible changes.");
  const zh = chinese.replace("#### 修复\n\n- 保存时保留文字。", "无用户可见变更。");
  const inputs = new Map([["CHANGELOG.md", en], ["CHANGELOG.zh-cn.md", zh]]);
  const build = () => buildReleaseChangelogs(path => inputs.get(path));
  assert.throws(build, /Review 1\.0\.1/);
  inputs.set("CHANGELOG.md", en.replace("### 1.0.1\n\nNo user-visible changes.",
    "### 1.0.1\n\nNo user-visible changes.\n<!-- release-net-zero: The proposed save behavior was reverted. -->"));
  assert.throws(build, /Review 1\.0\.1/, "The Chinese summary also needs its reason");
  inputs.set("CHANGELOG.zh-cn.md", zh.replace("### 1.0.1\n\n无用户可见变更。",
    "### 1.0.1\n\n无用户可见变更。\n<!-- release-net-zero: 保存行为已恢复到上一正式版本。 -->"));
  for (const text of build().values()) assert.doesNotMatch(text, /release-net-zero|reverted|已恢复/);
});
