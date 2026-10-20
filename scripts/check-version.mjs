import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

class VersionCheckError extends Error {}
const fail = message => { throw new VersionCheckError(message); };
const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const proxyPath = "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs";
const legacyProxyPath = "scripts/affinity-mcp-proxy.mjs";

// This repository deliberately accepts a smaller set than all legal SemVer.
export function parseVersion(value, channel) {
  if (!["development", "stable"].includes(channel)) fail("Specify channel: development or stable.");
  const match = typeof value === "string" && value.length <= 64 && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-dev\.([1-9]\d*))?$/.exec(value);
  if (!match || (channel === "development") !== Boolean(match[4])) fail(`Invalid ${channel} version.`);
  return { value, core: match.slice(1, 4).map(BigInt), sequence: match[4] ? BigInt(match[4]) : null };
}

function compareCore(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

function isNextCore(candidate, baseline) {
  const [major, minor, patch] = baseline;
  return [[major, minor, patch + 1n], [major, minor + 1n, 0n], [major + 1n, 0n, 0n]]
    .some(core => compareCore(candidate, core) === 0);
}

export function checkIncrement(version, previous, stable, channel) {
  const current = parseVersion(version, channel);
  if (channel === "stable") {
    const before = parseVersion(previous, "stable");
    if (!isNextCore(current.core, before.core)) fail("Stable version must be the next patch, minor or major target.");
    return;
  }
  const production = parseVersion(stable, "stable");
  const before = parseVersion(previous, previous?.includes("-dev.") ? "development" : "stable");
  if (!isNextCore(current.core, production.core)) fail("Development target must be the next patch, minor or major after the stable baseline.");
  if (before.sequence === null) {
    if (compareCore(before.core, production.core) > 0 || current.sequence !== 1n) fail("Migration from a stable declaration requires a confirmed production baseline and dev.1.");
  } else if (compareCore(current.core, before.core) === 0) {
    if (current.sequence !== before.sequence + 1n) fail("Development sequence must increase by exactly one for a new batch.");
  } else if (compareCore(current.core, before.core) < 0 || current.sequence !== 1n) {
    fail("A newer development target must restart at dev.1; target rollback is not allowed.");
  }
}

function readText(root, path) {
  try { return readFileSync(join(root, path), "utf8"); }
  catch { fail(`Cannot read required file: ${path}.`); }
}

function readJson(read, path) {
  try { return JSON.parse(read(path)); }
  catch (error) {
    if (error instanceof VersionCheckError) throw error;
    fail(`Invalid JSON: ${path}.`);
  }
}

function matchOne(text, pattern, label) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) fail(`Expected one version declaration: ${label}.`);
  return matches[0][1];
}

function packageDeclarations(read, selectedProxyPath = proxyPath) {
  const codex = readJson(read, ".codex-plugin/plugin.json");
  const claude = readJson(read, ".claude-plugin/plugin.json");
  const market = readJson(read, ".claude-plugin/marketplace.json");
  if (codex?.name !== "affinity-mcp" || claude?.name !== codex.name || market?.plugins?.length !== 1 || market.plugins[0]?.name !== codex.name) {
    fail("Cannot identify the affinity-mcp package in all three manifests.");
  }
  const proxy = read(selectedProxyPath);
  return [
    ["Codex manifest", codex.version],
    ["Claude Code manifest", claude.version],
    ["marketplace entry", market.plugins[0].version],
    ["proxy clientInfo", matchOne(proxy, /clientInfo:\s*\{[^{}]*?\bversion:\s*"([^"]+)"/g, "proxy clientInfo")],
    ["proxy serverInfo", matchOne(proxy, /serverInfo:\s*\{[^{}]*?\bversion:\s*"([^"]+)"/g, "proxy serverInfo")],
  ];
}

function consistentVersion(declarations, channel) {
  const version = declarations[0][1];
  parseVersion(version, channel);
  for (const [label, value] of declarations) if (value !== version) fail(`Version mismatch: ${label}.`);
  return version;
}

function git(root, args) {
  try { return execFileSync("git", ["--no-lazy-fetch", ...args], { cwd: root, encoding: "utf8", stdio: "pipe" }).trimEnd(); }
  catch { fail("Cannot verify the requested Git baseline locally; confirm the commit and available objects. No fetch was attempted."); }
}

function baseline(root, ref, channel) {
  const commit = git(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  if (!/^[0-9a-f]{40,64}$/.test(commit)) fail("Git baseline did not resolve to a commit.");
  const paths = git(root, ["ls-tree", "-r", "--name-only", "-z", commit, "--", legacyProxyPath, proxyPath]).split("\0").filter(Boolean);
  if (paths.length !== 1 || ![legacyProxyPath, proxyPath].includes(paths[0])) fail("Git baseline must contain exactly one supported proxy path.");
  const declarations = packageDeclarations(path => git(root, ["show", `${commit}:${path}`]), paths[0]);
  const version = declarations[0][1];
  return { commit, version: consistentVersion(declarations, channel ?? (typeof version === "string" && version.includes("-dev.") ? "development" : "stable")) };
}

export function checkRepository(root, { channel, from, stable } = {}) {
  for (const ref of [from, stable]) if (ref !== undefined && (typeof ref !== "string" || !ref.trim())) fail("Git baseline must be a nonempty commit reference.");
  const read = path => readText(root, path);
  const declarations = packageDeclarations(read);
  if (channel === "development" || existsSync(join(root, "docs"))) {
    declarations.push(
      ["docs entry", matchOne(read("docs/README.md"), /当前仓库清单为插件 `([^`]+)`/g, "docs entry")],
      ["architecture", matchOne(read("docs/architecture.md"), /插件标识 `([^`]+)`/g, "architecture")],
      ["SDK plugin identity", matchOne(read("docs/sdk/README.md"), /\| 仓库插件版本 \| `([^`]+)`/g, "SDK plugin identity")],
      ["SDK proxy identity", matchOne(read("docs/sdk/README.md"), /\| 代理报告版本 \| `([^`]+)`/g, "SDK proxy identity")],
    );
  }
  const changelog = read("CHANGELOG.md");
  const unreleasedHeading = /^## (?:Unreleased|未发布|\[Unreleased\])[ \t]*\r?$/gm;
  const unreleasedCount = [...changelog.matchAll(unreleasedHeading)].length;
  if (unreleasedCount > 1) fail("CHANGELOG permits at most one Unreleased section.");
  const unreleased = unreleasedCount ? changelog.split(unreleasedHeading)[1].split(/^##(?:\s|$)/m)[0] : "";
  const version = consistentVersion(declarations, channel);
  const pending = [...unreleased.matchAll(/^### ([^\s]+)[ \t]*\r?$/gm)];
  if (channel === "development" && pending.length) {
    consistentVersion([...declarations, ["CHANGELOG candidate", matchOne(unreleased, /^### ([^\s]+)[ \t]*\r?$/gm, "CHANGELOG candidate")]], channel);
  }
  if (channel === "stable" && (/^当前开发候选：/m.test(changelog) || /^### \S+-dev\.\d+[ \t]*\r?$/m.test(unreleased))) fail("Stable CHANGELOG must not retain a current development candidate declaration.");
  const entries = [];
  let groupDate;
  for (const line of changelog.split(/\r?\n/)) {
    if (/^##(?:\s|$)/.test(line)) {
      groupDate = /^## (\d{4}-\d{2}-\d{2})[ \t]*$/.exec(line)?.[1];
      const legacy = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})[ \t]*$/.exec(line);
      if (legacy?.[1] === version) entries.push([version, legacy[2]]);
    } else if (/^### ([^\s]+)[ \t]*$/.exec(line)?.[1] === version) entries.push([version, groupDate]);
  }
  if (channel === "development" && pending.length) {
    if (entries.length !== 1) fail("Development candidate requires exactly one CHANGELOG version entry.");
  } else {
    const date = entries[0]?.[1];
    if (entries.length !== 1 || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      fail(`${channel === "stable" ? "Stable candidate" : "Delivered development version"} requires exactly one matching CHANGELOG entry with a valid YYYY-MM-DD date.`);
    }
  }
  if (existsSync(join(root, "CHANGELOG.zh-cn.md"))) {
    const headings = {
      "## 未发布": "## Unreleased", "## [Unreleased]": "## Unreleased", "## 日期待核实": "## Date unverified",
      "#### 新增": "#### Added", "#### 变更": "#### Changed", "#### 修复": "#### Fixed",
      "#### 废弃": "#### Deprecated", "#### 移除": "#### Removed", "#### 安全": "#### Security",
    };
    const structure = text => text.split(/\r?\n/).map(line => line.trimEnd())
      .filter(line => /^#{2,4} |^- /.test(line)).map(line => line.startsWith("- ") ? "-" : headings[line] ?? line);
    if (JSON.stringify(structure(changelog)) !== JSON.stringify(structure(read("CHANGELOG.zh-cn.md")))) {
      fail("Bilingual CHANGELOG dates, versions, categories and entry counts must match.");
    }
  }
  if ((stable && !from) || (from && channel === "development" && !stable) || (stable && channel === "stable")) {
    fail("Increment checks require --from; development also requires --stable. Stable checks use --from only.");
  }
  const result = { mode: from ? "increment" : "static", channel, version };
  if (from) {
    const previous = baseline(root, from, channel === "stable" ? "stable" : undefined);
    const production = stable ? baseline(root, stable, "stable") : undefined;
    checkIncrement(version, previous.version, production?.version, channel);
    result.baselines = { from: previous, ...(production ? { stable: production } : {}) };
  }
  return result;
}

if (import.meta.main) {
  try {
    let values;
    try {
      ({ values } = parseArgs({ options: { channel: { type: "string" }, from: { type: "string" }, stable: { type: "string" }, root: { type: "string" } }, strict: true, allowPositionals: false }));
    } catch { fail("Usage: check-version.mjs --channel development|stable [--root directory] [--from commit] [--stable commit]"); }
    console.log(JSON.stringify(checkRepository(values.root ?? defaultRoot, values), null, 2));
  } catch (error) {
    console.error(error instanceof VersionCheckError ? error.message : "Version check failed; inspect the repository inputs.");
    process.exitCode = 1;
  }
}
