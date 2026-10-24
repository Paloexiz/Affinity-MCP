import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { checkIncrement, checkSnapshot, packageDeclarations, documentationDeclarations, parseVersion } from "./check-version.mjs";
import { Control, unissuedTargets } from "./release/control.mjs";

const fail = message => { throw new Error(message); };
export function git(root, args, raw = false) {
  try {
    const bytes = execFileSync("git", ["--no-replace-objects", "--no-lazy-fetch", ...args], { cwd: root, stdio: "pipe", maxBuffer: 32 * 1024 * 1024 });
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    return raw ? text : text.trimEnd();
  }
  catch { fail("Cannot verify Git objects locally. No implicit fetch was attempted."); }
}

export function checkSkipInstructions(text) {
  if (typeof text !== "string") fail("Expected a commit message or PR title.");
  // Reject every recognized marker, including messages later copied into a squash body.
  if (/\[(?:skip ci|ci skip|no ci|skip actions|actions skip)\]/i.test(text) || /^skip-checks\s*:\s*true\s*$/im.test(text)) fail("CI skip instructions are not allowed in a delivery.");
}

function commit(root, sha) {
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha) || /^0+$/.test(sha)) fail("Supply a nonzero full commit SHA for each baseline.");
  if (git(root, ["rev-parse", "--verify", `${sha}^{commit}`]) !== sha) fail("Baseline is not the exact commit.");
  return sha;
}

function declarations(read) {
  const values = [...packageDeclarations(read), ...documentationDeclarations(read)];
  for (const path of ["CHANGELOG.md", "CHANGELOG.zh-cn.md"]) {
    const current = /^### (\S+)[ \t]*\r?$/m.exec(read(path))?.[1];
    if (!current) fail(`Missing current version heading: ${path}.`);
    values.push([path, current]);
  }
  return values;
}

function inspectDelivery(root, { base, head, stable, title = "" } = {}) {
  for (const sha of [base, head, stable]) commit(root, sha);
  if (git(root, ["rev-parse", "--is-shallow-repository"]) !== "false") fail("Full history is required; fetch it explicitly before checking.");
  const objects = git(root, ["rev-list", "--objects", "--missing=print", base, head, stable]);
  if (objects.split("\n").some(line => line.startsWith("?"))) fail("Required Git objects are missing; fetch explicitly before checking.");
  if (base === head || !git(root, ["rev-list", head]).split("\n").includes(base)) fail("Base must be a strict ancestor of head.");
  const commits = git(root, ["rev-list", "--reverse", "--parents", `${base}..${head}`]).split("\n");
  if (commits.some(line => line.split(" ").length !== 2)) fail("Delivery history must be linear; rebase the PR and squash at merge.");
  checkSkipInstructions(title);
  const readAt = sha => path => git(root, ["show", `${sha}:${path}`], true);
  const previous = declarations(readAt(base));
  for (const line of commits) {
    const sha = line.split(" ")[0];
    checkSkipInstructions(git(root, ["show", "-s", "--format=%B", sha]));
    const values = declarations(readAt(sha));
    if (sha !== head && JSON.stringify(values) !== JSON.stringify(previous)) fail("All current version declarations must change only in the last commit.");
  }
  const current = declarations(readAt(head));
  const version = current[0][1];
  const production = packageDeclarations(readAt(stable));
  if (production.some(([, v]) => v !== production[0][1])) fail("Production version declarations mismatch.");
  if (previous.some(([, v]) => v !== previous[0][1])) fail("Previous development declarations mismatch.");
  checkSnapshot(readAt(head), path => Boolean(git(root, ["ls-tree", head, "--", path])), { channel: version.includes("-dev.") ? "development" : "stable" });
  if (current.some(([, v]) => v !== version)) fail("Current version declarations mismatch.");
  const changed = git(root, ["diff", "--name-only", "-z", base, head, "--"]).split("\0").filter(Boolean);
  const gateFiles = changed.filter(path => path.startsWith(".github/") || path.startsWith("scripts/") || path === "AGENTS.md");
  const gateDiff = gateFiles.length ? git(root, ["diff", "--no-ext-diff", "--no-textconv", base, head, "--", ...gateFiles]) : "";
  return { readAt, previous: previous[0][1], production: production[0][1], result: { version, baselines: { base, head, stable }, commits: commits.length, gateFiles, gateDiff } };
}

export function checkDelivery(root, options = {}) {
  if (options.type !== undefined && options.type !== "development") fail("Special transitions require the trusted candidate checker.");
  const { previous, production, result } = inspectDelivery(root, options);
  if (!result.version.includes("-dev.")) fail("Stable transitions require the trusted candidate checker; ordinary development only.");
  if (!previous.includes("-dev.") && previous !== production) fail("Stable freeze requires the same confirmed production baseline; use explicit candidate withdrawal.");
  checkIncrement(result.version, previous, production, "development");
  return { type: "development", ...result };
}

const logs = ["CHANGELOG.md", "CHANGELOG.zh-cn.md"];
// Only these identity fields may change during promotion; no draft prose is currently allowlisted.
const identityFields = {
  ".codex-plugin/plugin.json": [/("version"\s*:\s*")[^"]+(")/g],
  ".claude-plugin/plugin.json": [/("version"\s*:\s*")[^"]+(")/g],
  ".claude-plugin/marketplace.json": [/("version"\s*:\s*")[^"]+(")/g],
  "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs": [/(clientInfo:\s*\{[^{}]*?\bversion:\s*")[^"]+(")/g, /(serverInfo:\s*\{[^{}]*?\bversion:\s*")[^"]+(")/g],
  "docs/README.md": [/(当前仓库清单为插件 `)[^`]+(`)/g],
  "docs/architecture.md": [/(插件标识 `)[^`]+(`)/g],
  "docs/sdk/README.md": [/(\| 仓库插件版本 \| `)[^`]+(`)/g, /(\| 代理报告版本 \| `)[^`]+(`)/g],
};
function maskIdentity(text, patterns) {
  for (const pattern of patterns) {
    if ([...text.matchAll(pattern)].length !== 1) fail("Promotion identity field is ambiguous.");
    text = text.replace(pattern, "$1<version>$2");
  }
  return text;
}
function tree(root, sha) {
  return new Map(git(root, ["ls-tree", "-rz", sha], true).split("\0").filter(Boolean).map(line => {
    const match = /^(\d+) (\w+) ([0-9a-f]{40})\t([\s\S]+)$/.exec(line);
    if (!match) fail("Cannot identify exact tree entries.");
    return [match[4], { mode: match[1], type: match[2], sha: match[3] }];
  }));
}
function restrictedFiles(root, base, head, allowed) {
  const before = tree(root, base), after = tree(root, head), changed = [];
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(path), b = after.get(path);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (!allowed.includes(path) || a?.mode !== "100644" || b?.mode !== "100644" || a.type !== "blob" || b.type !== "blob") fail("Candidate transition contains a forbidden file or mode change.");
    changed.push(path);
  }
  return changed;
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function withoutEntry(text, version) {
  const groups = [...text.matchAll(/^## ([^\r\n]+)\r?\n/gm)];
  let rest = groups.length ? text.slice(0, groups[0].index) : text, selected;
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i], end = groups[i + 1]?.index ?? text.length, body = text.slice(group.index + group[0].length, end);
    const entries = [...body.matchAll(/^### (\S+)[ \t]*\r?\n/gm)], prefix = body.slice(0, entries[0]?.index ?? body.length);
    let found = false, retained = "";
    for (let j = 0; j < entries.length; j++) {
      const entry = entries[j], block = body.slice(entry.index, entries[j + 1]?.index ?? body.length);
      if (entry[1] === version) {
        if (selected || prefix.trim()) fail("Candidate CHANGELOG entry is duplicated or has unbound group prose.");
        const ordered = groups.every((other, index) => !validDate(other[1]) || index === i || (index < i ? other[1] > group[1] : other[1] < group[1]));
        selected = { date: group[1], block, ordered }; found = true;
      } else retained += block;
    }
    rest += found ? (retained ? group[0] + prefix + retained : "") : text.slice(group.index, end);
  }
  if (!selected) fail("Missing grouped candidate CHANGELOG entry.");
  return { ...selected, rest };
}
export function checkDevelopmentDate(root, options = {}) {
  const { previous, result, readAt } = inspectDelivery(root, options);
  parseVersion(previous, "development");
  if (previous !== result.version) fail("Development date closure must retain the exact development version.");
  if (restrictedFiles(root, options.base, options.head, logs).length !== 2) fail("Development date closure must change both CHANGELOG files only.");
  for (const path of logs) {
    const a = withoutEntry(readAt(options.base)(path), previous), b = withoutEntry(readAt(options.head)(path), previous);
    if (!["Unreleased", "未发布"].includes(a.date) || !validDate(b.date) || !b.ordered || a.block !== b.block || a.rest !== b.rest) fail("Development date closure must move only the unchanged Unreleased entry to a valid date and preserve history.");
  }
  return { type: "development-date", ...result };
}
function promotion(root, base, head, stable) {
  const inspected = inspectDelivery(root, { base, head, stable });
  const { previous, production, result, readAt } = inspected;
  parseVersion(previous, "development"); parseVersion(result.version, "stable");
  if (previous.split("-dev.")[0] !== result.version) fail("Promotion must keep the same core as the preceding development version.");
  checkIncrement(result.version, production, undefined, "stable");
  restrictedFiles(root, base, head, [...Object.keys(identityFields), ...logs]);
  for (const [path, patterns] of Object.entries(identityFields)) {
    if (maskIdentity(readAt(base)(path), patterns) !== maskIdentity(readAt(head)(path), patterns)) fail("Promotion changes content outside fixed identity fields.");
  }
  for (const path of logs) {
    const removed = withoutEntry(readAt(head)(path), result.version);
    if (!removed.ordered) fail("Promotion date order must be descending; reuse an existing same-date group.");
    const previousEntry = withoutEntry(readAt(base)(path), previous);
    const history = ["Unreleased", "未发布"].includes(previousEntry.date) ? previousEntry.rest : readAt(base)(path);
    if (!validDate(removed.date) || removed.rest !== history) fail("Promotion must add a dated stable summary and preserve all historical CHANGELOG bytes.");
  }
  return inspected;
}
function dateRevision(root, base, head, stable) {
  const inspected = inspectDelivery(root, { base, head, stable }), { previous, result, readAt } = inspected;
  parseVersion(previous, "stable");
  if (previous !== result.version) fail("Date revision must retain the exact stable version.");
  const changed = restrictedFiles(root, base, head, logs);
  if (changed.length !== 2) fail("Date revision must change both CHANGELOG dates.");
  for (const path of logs) {
    const a = withoutEntry(readAt(base)(path), previous), b = withoutEntry(readAt(head)(path), previous);
    if (!validDate(a.date) || !validDate(b.date) || !b.ordered || a.date === b.date || a.block !== b.block || a.rest !== b.rest) fail("Date revision must move only the unchanged current entry to a different valid date in descending date order.");
  }
  return inspected;
}
function withdrawalOrigin(root, candidate, stable) {
  let promotionSha = candidate;
  const dates = [];
  for (;;) {
    const parents = git(root, ["show", "-s", "--format=%P", promotionSha]).split(" ");
    if (parents.length !== 1 || !/^[0-9a-f]{40}$/.test(parents[0])) fail("Withdrawal origin must have complete single-parent history.");
    const parent = parents[0], read = path => git(root, ["show", parent + ":" + path], true);
    if (packageDeclarations(read)[0][1].includes("-dev.")) {
      const validated = promotion(root, parent, promotionSha, stable);
      return { promotion: promotionSha, development: parent, previous: validated.previous, dates };
    }
    dateRevision(root, parent, promotionSha, stable);
    dates.push(parent); promotionSha = parent;
  }
}

export function checkHistoricalCandidate(root, source, stable, retiredSources) {
  for (const sha of [source, stable]) commit(root, sha);
  const origin = withdrawalOrigin(root, source, stable);
  if (!Array.isArray(retiredSources) || retiredSources.includes(source) || origin.dates.some(sha => !retiredSources.includes(sha))) fail("Historical candidate retirement evidence differs.");
  return { source, stable, ...origin };
}

export async function checkCandidateDelivery(root, options, api, controlRoot) {
  const { type, event, base, head, stable, title = "" } = options;
  if (!["promote", "date-revision", "withdraw"].includes(type) || !["pull_request", "push"].includes(event)) fail("Select an explicit candidate transition and trusted PR/push event.");
  checkSkipInstructions(title);
  const expectedDevelop = event === "pull_request" ? base : head;
  const currentTip = async () => { if (await api.ref("heads/develop") !== expectedDevelop) fail("Event baseline no longer matches the exact current develop tip."); };
  await currentTip();
  const local = type === "promote" ? promotion(root, base, head, stable) : type === "date-revision" ? dateRevision(root, base, head, stable) : inspectDelivery(root, options);
  const version = type === "withdraw" ? local.previous : local.result.version;
  parseVersion(version, "stable");
  const control = new Control(api, controlRoot), before = await control.read();
  const state = before.tip.state;
  if (state.owner || state.intent) fail("Candidate transition requires an idle control history without unresolved writes.");
  if (state.retired_sources.includes(head)) fail("The resulting source has been permanently retired; rerunning checks cannot revive it.");
  if (type !== "promote" && !state.retired_sources.includes(base)) fail("Exact candidate source has not been permanently retired.");
  const facts = await unissuedTargets(api, version, stable);
  let origin;
  if (type === "withdraw") {
    origin = withdrawalOrigin(root, base, stable);
    const prior = parseVersion(origin.previous, "development");
    if (local.result.version !== version + "-dev." + (prior.sequence + 1n)) fail("Withdrawal must keep the same core and use the nearest development sequence plus one.");
    checkIncrement(local.result.version, origin.previous, local.production, "development");
    if (origin.dates.some(sha => !state.retired_sources.includes(sha))) fail("Historical date revision lacks permanent retirement of its exact base.");
    for (const path of logs) {
      const a = withoutEntry(local.readAt(base)(path), version), b = withoutEntry(local.readAt(head)(path), local.result.version);
      if (!validDate(a.date) || !["Unreleased", "未发布"].includes(b.date) || a.rest !== b.rest) fail("Withdrawal must replace only the unissued stable entry with the new Unreleased development summary.");
    }
  }
  const after = await control.read();
  if (after.tip.sha !== before.tip.sha) fail("Control state changed during transition verification.");
  await currentTip();
  if (await api.ref("heads/main") !== stable) fail("Formal baseline changed during transition verification.");
  const retirement = type === "promote" ? null : after.history.find(item => item.state.record.type === "retire" && item.state.record.data.source_sha === base)?.sha;
  if (type !== "promote" && !retirement) fail("Cannot bind permanent retirement to its control record.");
  return { type, ...local.result, transition: { candidate: base, promotion: origin?.promotion ?? (type === "promote" ? head : null), development: origin?.development ?? (type === "promote" ? base : null), head, stable, control_sha: after.tip.sha, retirement_commit: retirement, unissued: facts } };
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(["root", "base", "head", "stable", "title", "type"].map(key => [key, { type: "string" }])), strict: true, allowPositionals: false });
    const check = values.type === "development-date" ? checkDevelopmentDate : checkDelivery;
    console.log(JSON.stringify(check(values.root ?? process.cwd(), values), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
