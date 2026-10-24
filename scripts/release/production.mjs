import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, lstatSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { join, resolve } from "node:path";
import { checkSnapshot, checkIncrement, packageDeclarations, parseVersion } from "../check-version.mjs";
import { productionAllowlist, checkProductionReferences } from "../check-links.mjs";
import { encodeZip, decodeZip, checkPath, pathOrder } from "./archive.mjs";

export const recipeVersion = "1";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = message => { throw new Error(message); };
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const text = bytes => new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);

function gitBytes(root, args, input) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: devNull, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" });
  // shortcut: buffer Git results up to 256 MiB, stream before admitting larger production files.
  try { return execFileSync("git", ["--no-lazy-fetch", "--no-replace-objects", ...args], { cwd: root, input, env, stdio: "pipe", maxBuffer: 256 * 1024 * 1024 }); }
  catch (error) {
    if (args[0] === "check-ignore" && error.status === 1) return Buffer.alloc(0);
    fail("Cannot read or construct required Git objects locally; no fetch was attempted.");
  }
}

function snapshot(root, commit) {
  if (typeof commit !== "string" || !/^[0-9a-f]{40}$/.test(commit)) fail("A full lowercase Git commit SHA is required.");
  if (text(gitBytes(root, ["rev-parse", "--verify", `${commit}^{commit}`])).trim() !== commit) fail("Git object must be the exact commit.");
  const entries = new Map(text(gitBytes(root, ["ls-tree", "--full-tree", "-r", "-z", commit])).split("\0").filter(Boolean).map(line => {
    const match = /^(\d{6}) (blob|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
    if (!match) fail("Unsupported Git tree entry.");
    return [match[4], { mode: match[1], type: match[2], oid: match[3] }];
  }));
  const bytes = path => {
    const entry = entries.get(path);
    if (!entry) fail(`Missing production source: ${path}.`);
    if (entry.type !== "blob" || entry.mode !== "100644") fail(`Unsupported source mode: ${path}.`);
    return gitBytes(root, ["cat-file", "blob", entry.oid]);
  };
  return { entries, bytes, read: path => text(bytes(path)), exists: path => entries.has(path) || [...entries.keys()].some(file => file.startsWith(path + "/")) };
}

export function transformReadme(path, bytes, source) {
  const historical = {
    "README.md": ["859cd73854e0ef3bd342148b610020ad8445057c3412753be7db6e9530dd2d61", "## Validation", "### Check a real installed connection"],
    "README.zh-cn.md": ["99f3bb507df8c8ae03aaec85edad663c218e6dea2dcce3238f9e780662087efe", "## 验证", "### 检查真实安装连接"],
  }[path];
  if (!historical || !/^[0-9a-f]{40}$/.test(source)) fail("Invalid README transformation identity.");
  let result = text(bytes);
  if (source === "33aec1d170d982000c36ceafdc8dfd7f52bcfdff" && sha256(bytes) === historical[0]) {
    const start = result.indexOf(historical[1] + "\n"), end = result.indexOf(historical[2] + "\n", start);
    result = result.slice(0, start) + result.slice(end + 1);
  }
  if (result.split("](docs/versioning.md)").length !== 2) fail("README must have exactly one designated versioning link.");
  return Buffer.from(result.replace("](docs/versioning.md)", `](https://github.com/Paloexiz/Affinity-MCP/blob/${source}/docs/versioning.md)`));
}

export function productionTree(files) {
  const scratch = mkdtempSync(join(tmpdir(), "ai-agent-production-tree-"));
  try {
    gitBytes(scratch, ["init", "--object-format=sha1", "."]);
    const ignore = files.find(file => file.path === ".gitignore");
    if (ignore) writeFileSync(join(scratch, ".gitignore"), ignore.bytes);
    if (gitBytes(scratch, ["check-ignore", "--no-index", "-z", "--stdin"], Buffer.from(files.map(file => file.path + "\0").join(""))).length) fail("Production template ignores an allowed output.");
    const tree = new Map();
    for (const { path, mode, bytes } of files) {
      checkPath(path);
      if (mode !== "100644") fail("Unsupported production mode.");
      const oid = text(gitBytes(scratch, ["hash-object", "-w", "--stdin", "--no-filters"], bytes)).trim();
      const parts = path.split("/"); const name = parts.pop(); let directory = tree;
      for (const part of parts) {
        if (!directory.has(part)) directory.set(part, new Map());
        directory = directory.get(part);
        if (!(directory instanceof Map)) fail("Production file/directory collision.");
      }
      if (directory.has(name)) fail("Duplicate production path.");
      directory.set(name, { mode, oid });
    }
    const writeTree = directory => {
      const records = [...directory].map(([name, entry]) => entry instanceof Map
        ? `040000 tree ${writeTree(entry)}\t${name}\0` : `${entry.mode} blob ${entry.oid}\t${name}\0`);
      return text(gitBytes(scratch, ["mktree", "-z"], Buffer.from(records.join("")))).trim();
    };
    return writeTree(tree);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

export function buildProduction(root, { source, base }) {
  const candidate = snapshot(root, source), prior = snapshot(root, base);
  const version = checkSnapshot(candidate.read, candidate.exists, { channel: "stable" }).version;
  const declarations = packageDeclarations(prior.read), previous = declarations[0][1];
  parseVersion(previous, "stable");
  if (declarations.some(([, value]) => value !== previous)) fail("Production base versions differ.");
  checkIncrement(version, previous, undefined, "stable");
  let groupDate, releaseDate;
  for (const line of candidate.read("CHANGELOG.md").split(/\r?\n/)) {
    if (/^## /.test(line)) groupDate = /^## (\d{4}-\d{2}-\d{2})[ \t]*$/.exec(line)?.[1];
    if (line.trimEnd() === `### ${version}`) releaseDate = groupDate;
  }
  if (!releaseDate) fail("Release requires a dated bilingual CHANGELOG group.");
  const list = productionAllowlist(candidate.read, candidate.exists);
  if (list.length !== 28) fail("Recipe v1 requires the reviewed 28-file allowlist.");
  const files = list.map(entry => {
    const { path, source: from, transform } = entry;
    checkPath(path); checkPath(from);
    const bytes = candidate.bytes(from);
    return { path, mode: "100644", bytes: transform === "readme" ? transformReadme(path, bytes, source) : bytes };
  }).sort((a, b) => pathOrder(a.path, b.path));
  const byPath = new Map(files.map(file => [file.path, file]));
  checkProductionReferences(path => text(byPath.get(path)?.bytes ?? fail(`Missing packaged file: ${path}.`)), list);
  checkSnapshot(path => text(byPath.get(path)?.bytes ?? fail(`Missing packaged file: ${path}.`)), path => byPath.has(path), { channel: "stable" });
  const built = productionBundle(files, { source, base, version, releaseDate });
  built.summary.production_changes = [...new Set([...prior.entries.keys(), ...byPath.keys()])].sort(pathOrder).flatMap(path => {
    const old = prior.entries.get(path), current = byPath.get(path);
    const before = old ? { mode: old.mode, sha256: sha256(prior.bytes(path)) } : null;
    const after = current ? { mode: current.mode, sha256: sha256(current.bytes) } : null;
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path, before, after }];
  });
  return { files, ...built };
}

export function productionBundle(files, { source, base, version, releaseDate }) {
  files = [...files].sort((a, b) => pathOrder(a.path, b.path));
  const archive = encodeZip(files), tree = productionTree(files);
  const archiveName = `affinity-mcp-${version}.zip`;
  const manifest = {
    schema_version: 1, recipe_version: recipeVersion, version, release_date: releaseDate,
    source_sha: source, production_base_sha: base, production_tree_sha: tree, tag: `v${version}`,
    files: files.map(({ path, mode, bytes }) => ({ path, mode, sha256: sha256(bytes) })),
    archive: { name: archiveName, size: archive.length, sha256: sha256(archive) },
    verification_scope: { production_files: "explicit-allowlist", installation_check: "mock-only; results recorded separately", real_affinity_sdk: "not-verified", host_and_marketplace: "not-verified" },
  };
  const manifestBytes = jsonBytes(manifest);
  const sums = Buffer.from([[archiveName, archive], ["release-manifest.json", manifestBytes]].sort(([a], [b]) => pathOrder(a, b)).map(([name, bytes]) => `${sha256(bytes)}  ${name}\n`).join(""));
  const summary = { source_sha: source, production_base_sha: base, production_tree_sha: tree, version, release_date: releaseDate, recipe_version: recipeVersion, archive_name: archiveName, archive_sha256: sha256(archive), manifest_sha256: sha256(manifestBytes) };
  return { manifest, summary, bundle: new Map([[archiveName, archive], ["release-manifest.json", manifestBytes], ["SHA256SUMS", sums]]) };
}

export function prepare(root, { source, base, output }) {
  const built = buildProduction(root, { source, base });
  mkdirSync(output);
  try {
    for (const [name, bytes] of built.bundle) writeFileSync(join(output, name), bytes, { flag: "wx" });
  } catch (error) { rmSync(output, { recursive: true, force: true }); throw error; }
  return built.summary;
}

export function verify(root, { source, base, bundle, expected }) {
  const built = buildProduction(root, { source, base });
  const folder = resolve(bundle);
  if (!lstatSync(folder).isDirectory() || lstatSync(folder).isSymbolicLink() || JSON.stringify(readdirSync(folder).sort()) !== JSON.stringify([...built.bundle.keys()].sort())) fail("Release assets must be exactly the three expected files.");
  const received = new Map();
  for (const [name, bytes] of built.bundle) {
    const path = join(folder, name), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail("Release assets must be regular files.");
    const actual = readFileSync(path); received.set(name, actual);
    if (!actual.equals(bytes)) fail(`Release ${name} differs from the frozen source/recipe.`);
  }
  const unpacked = decodeZip(received.get(built.summary.archive_name));
  if (productionTree(unpacked) !== built.manifest.production_tree_sha) fail("ZIP tree differs from the manifest/source tree.");
  for (const [key, pattern] of [["production_tree_sha", /^[0-9a-f]{40}$/], ["archive_sha256", /^[0-9a-f]{64}$/], ["manifest_sha256", /^[0-9a-f]{64}$/]]) {
    if (!pattern.test(expected?.[key]) || expected[key] !== built.summary[key]) fail(`Approved ${key} differs from verified content.`);
  }
  return built.summary;
}
