import { readFileSync, lstatSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { posix, resolve, join } from "node:path";
import { parseArgs } from "node:util";

const fail = message => { throw new Error(message); };
function git(root, args) {
  try {
    const bytes = execFileSync("git", ["--no-replace-objects", "--no-lazy-fetch", ...args], { cwd: root, stdio: "pipe", maxBuffer: 32 * 1024 * 1024 });
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes).trimEnd();
  } catch { fail("Cannot verify Git objects locally. No implicit fetch was attempted."); }
}
function visible(text, keepCode = true) {
  text = text.replace(/\r\n/g, "\n");
  let fence, comment = false;
  return text.split("\n").map(line => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line); const marker = match?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && /^[ \t]*$/.test(match[2])) fence = undefined;
      return "";
    }
    if (!comment && marker && (marker[0] !== "`" || !match[2].includes("`"))) { fence = marker; return ""; }
    let output = "", offset = 0;
    while (offset < line.length) {
      if (comment) {
        const end = line.indexOf("-->", offset);
        if (end === -1) break;
        offset = end + 3; comment = false;
      } else {
        const token = /`+|<!--/.exec(line.slice(offset));
        if (!token) { output += line.slice(offset); break; }
        output += line.slice(offset, offset + token.index);
        offset += token.index + token[0].length;
        if (token[0] === "<!--") comment = true;
        else {
          // shortcut: only same-line code spans; use fenced examples until a fuller parser is needed.
          const close = [...line.slice(offset).matchAll(/`+/g)].find(run => run[0] === token[0]);
          if (!close) fail("Unmatched or multiline inline code is unsupported; use fenced code.");
          if (keepCode) output += token[0] + line.slice(offset, offset + close.index + close[0].length);
          offset += close.index + close[0].length;
        }
      }
    }
    return output;
  }).join("\n");
}

function anchors(text) {
  const ids = new Set(); const counts = new Map();
  const body = visible(text);
  for (const match of visible(text, false).matchAll(/<[a-z][^>]*\s(?:id|name)\s*=\s*["']([^"']+)["']/gi)) ids.add(match[1]);
  for (const match of body.matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    const slug = match[1].replace(/<[^>]*>/g, "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");
    const count = counts.get(slug) ?? 0; counts.set(slug, count + 1);
    ids.add(slug + (count ? `-${count}` : ""));
  }
  return ids;
}

function links(text) {
  const body = visible(text, false);
  const definitions = new Map(); const found = [];
  const label = value => value.trim().replace(/\s+/g, " ").toLowerCase();
  for (const match of body.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm)) definitions.set(label(match[1]), match[2].replace(/^<|>$/g, ""));
  for (const match of body.matchAll(/\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) found.push(match[1] ?? match[2] ?? match[3]);
  for (const match of body.matchAll(/!?\[([^\]\n]*)\](\(|\[([^\]\n]*)\])/g)) {
    if (match[2] !== "(") {
      const key = label(match[3] || match[1]);
      if (!definitions.has(key)) fail(`Unresolved link reference: ${key}.`);
      found.push(definitions.get(key)); continue;
    }
    let i = match.index + match[0].length;
    while (/\s/.test(body[i] ?? "") && i < body.length) i++;
    const angle = body[i] === "<"; if (angle) i++;
    const start = i; let depth = 0;
    for (; i < body.length; i++) {
      if (body[i] === "\\") { i++; continue; }
      if (angle && body[i] === ">") break;
      if (!angle) {
        if (body[i] === "(") depth++;
        if (body[i] === ")" && depth-- === 0) break;
        if (/\s/.test(body[i])) break;
      }
    }
    found.push(body.slice(start, i).replace(/\\([()])/g, "$1"));
  }
  return found;
}

function target(source, url) {
  if (/^(?:https?:|mailto:)/i.test(url) || url.startsWith("//")) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("/") || url.includes("\\")) fail(`Unsupported absolute/local link in ${source}.`);
  let path; let fragment;
  try { [path, fragment] = url.split("#").map(decodeURIComponent); path = path.split("?")[0]; }
  catch { fail(`Malformed link encoding in ${source}.`); }
  path = path ? posix.normalize(posix.join(posix.dirname(source), path)) : source;
  if (path === ".." || path.startsWith("../") || path.startsWith("/") || path.includes("\\") || /[\x00-\x1f]/.test(path)) fail(`Link outside repository in ${source}.`);
  return { path, fragment };
}

function safeFile(root, path) {
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    let stat; try { stat = lstatSync(current); } catch { fail(`Missing local link/source: ${path}.`); }
    if (stat.isSymbolicLink()) fail(`Symlink is not an allowed link/source: ${path}.`);
  }
  const result = spawnSync("git", ["check-ignore", "--no-index", "-q", "--", path], { cwd: root });
  if (result.status === 0) fail(`Local link/source is ignored: ${path}.`);
  if (result.status !== 1) fail("Cannot verify ignore rules.");
  return lstatSync(join(root, path));
}

function documentedFiles(text) {
  const sections = visible(text).split(/^<a id="production-content"><\/a>[ \t]*$/m);
  const section = sections.length === 2 ? sections[1].split(/^## /m)[1] : undefined;
  if (!section) fail("Missing documented production allowlist.");
  const paths = [];
  for (const line of section.split("\n").filter(line => line.startsWith("|"))) {
    const literals = [...line.matchAll(/`([^`]+)`/g)].map(match => match[1]);
    let prefix = "";
    for (const path of literals) {
      if (path.endsWith("/")) prefix = path;
      else paths.push(path.includes("/") ? path : prefix + path);
    }
  }
  return paths.sort();
}

export function checkLinks(root, { production = true } = {}) {
  root = resolve(root);
  const files = [...new Set(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))];
  const known = new Set(files);
  const available = path => path === "." || known.has(path) || files.some(file => file.startsWith(path.replace(/\/$/, "") + "/"));
  const read = path => readFileSync(join(root, path), "utf8");
  let checked = 0;
  const documents = files.filter(path => /\.(?:md|html)$/i.test(path));
  for (const source of documents) {
    safeFile(root, source);
    const targets = links(read(source)).map(url => target(source, url)).filter(Boolean);
    for (const { path, fragment } of targets) {
      safeFile(root, path);
      if (!available(path)) fail(`Local link is not trackable: ${source} -> ${path}.`);
      if (fragment && /\.(?:md|html)$/i.test(path) && !anchors(read(path)).has(fragment)) fail(`Missing link anchor: ${source} -> ${path}#${fragment}.`);
      checked++;
    }
  }
  if (!production) return { ok: true, documents: documents.length, links: checked };
  const entries = productionAllowlist(read, path => safeFile(root, path).isFile() && available(path));
  checkProductionReferences(read, entries, { allowReadmeDevelopmentLink: true });
  return { ok: true, documents: documents.length, links: checked, productionFiles: entries.length };
}

export function productionAllowlist(read, exists) {
  const entries = JSON.parse(read("scripts/production-files.json"));
  if (!Array.isArray(entries) || !entries.length) fail("Production allowlist must be a nonempty array.");
  const outputs = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || Object.keys(entry).sort().join(",") !== "path,source,transform") fail("Invalid production allowlist entry.");
    const { path, source, transform } = entry;
    for (const value of [path, source]) if (typeof value !== "string" || value !== posix.normalize(value) || value.startsWith("/") || value.startsWith("../") || /[\\\x00-\x1f]/.test(value)) fail("Invalid production path.");
    if (outputs.has(path)) fail("Duplicate production path."); outputs.add(path);
    if (transform !== (["README.md", "README.zh-cn.md"].includes(path) ? "readme" : "copy")) fail("Unknown production transform.");
    if (source !== (path === ".gitignore" ? "scripts/production.gitignore" : path)) fail("Unexpected production source mapping.");
    if (!exists(source)) fail(`Missing production source: ${source}.`);
  }
  if (JSON.stringify([...outputs].sort()) !== JSON.stringify(documentedFiles(read("docs/versioning.md")))) fail("Production allowlist differs from docs/versioning.md.");
  return entries;
}

export function checkProductionReferences(read, entries, { allowReadmeDevelopmentLink = false } = {}) {
  const outputs = new Set(entries.map(entry => entry.path));
  const inPackage = path => path === "." || path === "./" || outputs.has(path) || [...outputs].some(file => file.startsWith(path.replace(/\/$/, "") + "/"));
  for (const { path: source, transform } of entries) {
    const targets = /\.(?:md|html)$/i.test(source) ? links(read(source)).map(url => target(source, url)).filter(Boolean) : [];
    for (const { path, fragment } of targets) {
      if (allowReadmeDevelopmentLink && transform === "readme" && path === "docs/versioning.md") continue;
      if (!inPackage(path)) fail(`Production link requires a development file: ${source} -> ${path}.`);
      if (fragment && /\.(?:md|html)$/i.test(path) && !anchors(read(path)).has(fragment)) fail(`Missing production link anchor: ${source} -> ${path}#${fragment}.`);
    }
    if (/\.md$/.test(source)) {
      const text = read(source);
      const commandRoot = source.startsWith("skills/affinity-mcp/") && text.includes("Run from the Skill directory") ? "skills/affinity-mcp" : ".";
      for (const match of text.matchAll(/\bnode\s+([\w./-]+\.mjs)\b/g)) if (!outputs.has(posix.join(commandRoot, match[1]))) fail(`Production command is not packaged: ${source} -> ${match[1]}.`);
    }
    if (/\.mjs$/.test(source)) {
      for (const match of read(source).matchAll(/\b(?:from\s*|import\s*\(\s*|import\s*)["']([^"']+)["']/g)) {
        if (match[1].startsWith("node:")) continue;
        const dependency = match[1].startsWith(".") ? posix.normalize(posix.join(posix.dirname(source), match[1])) : match[1];
        if (!outputs.has(dependency)) fail(`Production import is not packaged: ${source} -> ${dependency}.`);
      }
    }
    if (/\.json$/.test(source)) {
      const visit = (value, key = "") => {
        if (Array.isArray(value)) { value.forEach(item => visit(item, key)); return; }
        if (value && typeof value === "object") { Object.entries(value).forEach(([k, v]) => visit(v, k)); return; }
        if (typeof value !== "string" || /^(?:https?:|mailto:)/.test(value)) return;
        if (source === ".agents/plugins/marketplace.json" && key === "source" && value === "local") return;
        if (["path", "source", "cwd", "skills", "logo", "logoDark", "composerIcon"].includes(key) || (["args", "command"].includes(key) && /[/.]/.test(value))) {
          const path = posix.normalize(value.replace(/^\$\{CLAUDE_PLUGIN_ROOT\}\//, ""));
          if (!inPackage(path)) fail(`Production manifest reference is not packaged: ${source} -> ${path}.`);
        }
      };
      visit(JSON.parse(read(source)));
    }
  }
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: { root: { type: "string" } }, strict: true, allowPositionals: false });
    console.log(JSON.stringify(checkLinks(values.root ?? process.cwd())));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
