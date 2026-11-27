import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { checkBilingualChangelogs, parseVersion } from "./check-version.mjs";

export const releaseFiles = new Map([
  ["CHANGELOG.md", "CHANGELOG.release.md"],
  ["CHANGELOG.zh-cn.md", "CHANGELOG.release.zh-cn.md"],
]);

const formats = {
  "CHANGELOG.md": {
    title: "# Affinity MCP Changelog", pending: "Unreleased", unknown: "Date unverified",
    marker: "No user-visible changes.", categories: ["Added", "Changed", "Fixed", "Deprecated", "Removed", "Security"],
  },
  "CHANGELOG.zh-cn.md": {
    title: "# Affinity MCP 更新日志", pending: "未发布", unknown: "日期待核实",
    marker: "无用户可见变更。", categories: ["新增", "变更", "修复", "废弃", "移除", "安全"],
  },
};

function validateSummary(body, format, version) {
  if (body === format.marker) return;
  const sections = body.split(/^#### /m);
  if (sections.shift() !== "" || !sections.length) throw new Error(`Missing or invalid CHANGELOG summary for ${version}.`);
  const used = new Set();
  for (const section of sections) {
    const [category, ...lines] = section.trimEnd().split("\n");
    if (!format.categories.includes(category) || used.has(category)) throw new Error(`Invalid release category for ${version}.`);
    used.add(category);
    let hasItem = false;
    for (const line of lines) {
      if (!line.trim()) continue;
      if (/^- \S/.test(line)) hasItem = true;
      else if (!hasItem || !/^\s+\S/.test(line)) throw new Error(`Invalid release entry for ${version}.`);
    }
    if (!hasItem) throw new Error(`Empty release category for ${version}.`);
  }
}

function stableHistory(text, format) {
  const [intro, ...groups] = text.replaceAll("\r\n", "\n").split(/^## /m);
  const [title, ...preamble] = intro.split("\n");
  if (title !== format.title) throw new Error("Unexpected CHANGELOG title.");
  if (preamble.some(line => /^#{1,6}(?:\s|$)/.test(line))) throw new Error("CHANGELOG version or section outside a date group.");
  const output = [format.title];
  const versions = new Set();
  const dates = new Set();
  const changedDevelopmentCores = new Set();
  const unconfirmedEmptyReleases = [];
  let previousDate;
  for (const group of groups) {
    const [heading, ...entries] = group.split(/^### /m);
    const date = heading.trim();
    if (date !== format.pending && date !== format.unknown &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
      throw new Error("Invalid CHANGELOG date group.");
    }
    if (dates.has(date)) throw new Error("Duplicate CHANGELOG date group.");
    if (date === format.pending && dates.size) throw new Error("The unreleased group must come first.");
    if (dates.has(format.unknown)) throw new Error("The unverified date group must come last.");
    if (date !== format.pending && date !== format.unknown) {
      if (previousDate && date > previousDate) throw new Error("CHANGELOG dates must be newest first.");
      previousDate = date;
    }
    dates.add(date);
    const stable = [];
    for (const entry of entries) {
      const [version, ...lines] = entry.split("\n");
      const channel = version.includes("-dev.") ? "development" : "stable";
      parseVersion(version, channel);
      if (versions.has(version)) throw new Error(`Duplicate CHANGELOG version: ${version}.`);
      versions.add(version);
      let body = lines.join("\n").trim();
      // A stable summary can record why changes in its development batches did not ship.
      const summaryLines = body.split("\n");
      const note = summaryLines.at(-1);
      const hasReason = /^<!-- release-net-zero: \S(?:[^\n]*\S)? -->$/.test(note);
      if (hasReason) {
        body = summaryLines.slice(0, -1).join("\n").trimEnd();
        if (channel !== "stable" || body !== format.marker) throw new Error(`Unexpected release-net-zero note for ${version}.`);
      }
      if (/<!--\s*release-net-zero\b/.test(body)) throw new Error(`Invalid release-net-zero note for ${version}.`);
      validateSummary(body, format, version);
      if (channel === "development") {
        if (body !== format.marker) changedDevelopmentCores.add(version.split("-")[0]);
        continue;
      }
      if (date === format.pending) throw new Error(`Stable version ${version} requires a delivery date group.`);
      if (body === format.marker && !hasReason) unconfirmedEmptyReleases.push(version);
      stable.push(`### ${version}\n\n${body}`);
    }
    if (stable.length) output.push(`## ${date}`, ...stable);
  }
  for (const version of unconfirmedEmptyReleases) {
    if (changedDevelopmentCores.has(version)) throw new Error(`Review ${version}: its development batches list changes. Summarize what shipped or add a release-net-zero reason.`);
  }
  if (output.length === 1) throw new Error("No stable CHANGELOG entries found.");
  return output.join("\n\n") + "\n";
}

export function buildReleaseChangelogs(read) {
  const histories = Object.fromEntries([...releaseFiles.keys()].map(path => [path, read(path)]));
  checkBilingualChangelogs(histories["CHANGELOG.md"], histories["CHANGELOG.zh-cn.md"]);
  const generated = new Map();
  for (const [source, output] of releaseFiles) {
    generated.set(output, stableHistory(histories[source], formats[source]));
  }
  return generated;
}

export function checkReleaseChangelogs(read) {
  for (const [path, expected] of buildReleaseChangelogs(read)) {
    if (read(path) !== expected) throw new Error(`Regenerate ${path} from the full changelogs.`);
  }
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: { check: { type: "boolean" }, root: { type: "string" } } });
    const root = values.root ?? fileURLToPath(new URL("../", import.meta.url));
    const read = path => readFileSync(join(root, path), "utf8");
    if (values.check) checkReleaseChangelogs(read);
    else for (const [path, text] of buildReleaseChangelogs(read)) writeFileSync(join(root, path), text);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
