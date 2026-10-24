import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkDelivery, checkDevelopmentDate, checkCandidateDelivery, git } from "./check-delivery.mjs";
import { parseVersion } from "./check-version.mjs";
import { GitHub, id, hash } from "./release/github.mjs";

const fail = message => { throw new Error(message); };
function sha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value) || /^0+$/.test(value)) fail("CI requires exact nonzero commit SHAs.");
  return value;
}

export function dispatchInput(input) {
  const fields = {
    ci: ["base_sha"],
    publish: ["source_sha", "base_sha", "version", "push_run_id", "push_attempt", "ref_artifact_id", "ref_artifact_digest"],
    recover: ["source_sha", "base_sha", "version", "production_sha", "receipt_sha"],
    "retire-candidate": ["source_sha", "version", "reason"],
    "control-recover": ["source_sha", "version"],
  };
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Dispatch inputs must be an object.");
  const all = new Set(["operation", "expected_tool_sha", "entry_id", ...Object.values(fields).flat()]);
  if (Object.entries(input).some(([key, value]) => !all.has(key) || typeof value !== "string")) fail("Unknown or non-string dispatch input.");
  const values = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== ""));
  const operation = values.operation ?? "ci", required = fields[operation];
  if (!Object.hasOwn(fields, operation)) fail("Unknown dispatch operation.");
  const optional = ["operation", "expected_tool_sha", "entry_id"];
  if (required.some(key => !values[key]) || Object.keys(values).some(key => ![...required, ...optional].includes(key))) fail("Dispatch inputs do not match this operation.");
  if (operation !== "ci" || values.expected_tool_sha || values.entry_id) {
    sha(values.expected_tool_sha);
    if (!/^[a-f0-9]{32}$/.test(values.entry_id ?? "")) fail("Dispatch needs an exact unique entry identity.");
  }
  for (const [key, value] of Object.entries(values)) {
    if (key.endsWith("_sha")) sha(value);
    if (["push_run_id", "push_attempt", "ref_artifact_id"].includes(key) && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) fail("Dispatch numeric identities must be positive decimal integers.");
  }
  if (values.version) parseVersion(values.version, "stable");
  if (values.ref_artifact_digest) hash(values.ref_artifact_digest);
  if (operation === "retire-candidate" && !["date-revision", "withdraw"].includes(values.reason)) fail("Guard reason must be date-revision or withdraw.");
  return { ...values, operation };
}

export function eventIdentity(name, event, env) {
  const integration = sha(env.GITHUB_SHA); const ref = env.GITHUB_REF;
  let base, head, title = "";
  if (name === "pull_request") {
    if (event.pull_request?.base?.ref !== "develop" || !Number.isSafeInteger(event.number) || ref !== `refs/pull/${event.number}/merge`) fail("CI requires a PR merge ref targeting develop.");
    base = sha(event.pull_request.base.sha); head = sha(event.pull_request.head.sha); title = event.pull_request.title ?? "";
  } else if (name === "push") {
    if (ref !== "refs/heads/develop" || event.ref !== ref || event.deleted || event.after !== integration) fail("CI push identity must be refs/heads/develop and the exact event SHA.");
    base = sha(event.before); head = integration;
  } else if (name === "workflow_dispatch") {
    if (ref !== "refs/heads/develop") fail("Read-only CI dispatch must select develop.");
    const inputs = dispatchInput(event.inputs);
    if (inputs.operation !== "ci" || (inputs.expected_tool_sha && inputs.expected_tool_sha !== integration)) fail("CI dispatch cannot stand in for another operation or tool.");
    base = sha(inputs.base_sha); head = integration;
  } else fail("Unsupported CI event.");
  return { event: name, base, head, integration, ref, title };
}

export function verifyCheckout(root, identity) {
  if (git(root, ["rev-parse", "HEAD"]) !== identity.integration) fail("CI checkout does not match the exact integration SHA.");
  if (identity.event === "pull_request") {
    const parents = git(root, ["show", "-s", "--format=%P", identity.integration]).split(" ");
    if (JSON.stringify(parents) !== JSON.stringify([identity.base, identity.head])) fail("PR integration parents differ from event base/head; rerun with a fresh event.");
  }
}

export function fetchInputs(root, identity, remote, token, { objects = [], control = false } = {}) {
  for (const value of [identity.base, identity.head, ...objects]) sha(value);
  const depth = git(root, ["rev-parse", "--is-shallow-repository"]) === "true" ? ["--unshallow"] : [];
  const auth = token ? { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `http.${remote}.extraheader`, GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}` } : {};
  // Authentication is scoped to this explicit fetch; the checker never fetches objects.
  try {
    execFileSync("git", ["fetch", "--no-tags", ...depth, "origin", "+refs/heads/main:refs/remotes/origin/main", ...(control ? ["+refs/heads/release-control:refs/remotes/origin/release-control"] : []), identity.base, identity.head, ...objects], { cwd: root, stdio: "pipe", env: { ...process.env, ...auth, GIT_TERMINAL_PROMPT: "0" } });
  } catch { fail("Explicit CI fetch failed; base/head/main objects must be available before checking."); }
  const missing = git(root, ["rev-list", "--objects", "--missing=print", identity.base, identity.head, "refs/remotes/origin/main", ...objects, ...(control ? ["refs/remotes/origin/release-control"] : [])]);
  if (missing.split("\n").some(line => line.startsWith("?"))) fail("Explicit CI fetch did not supply all required objects.");
  return sha(git(root, ["rev-parse", "refs/remotes/origin/main^{commit}"]));
}

export function deliveryType(previous, current, production) {
  for (const version of [previous, current, production]) parseVersion(version, typeof version === "string" && version.includes("-dev.") ? "development" : "stable");
  if (current === previous && current.includes("-dev.")) return "development-date";
  if (current.includes("-dev.")) return !previous.includes("-dev.") && previous !== production ? "withdraw" : "development";
  return previous.includes("-dev.") ? "promote" : "date-revision";
}

function report(value) {
  const text = JSON.stringify(value, null, 2);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<pre>${escaped}</pre>\n`);
  }
}

function runtime(root) {
  const version = git(root, ["--version"]);
  const numbers = /git version (\d+)\.(\d+)/.exec(version);
  if (!numbers || Number(numbers[1]) < 2 || (Number(numbers[1]) === 2 && Number(numbers[2]) < 45)) fail("Git 2.45+ is required.");
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 24 || (major === 24 && minor < 20)) fail("Node 24.20+ is required.");
  const env = process.env;
  report({ node: process.version, git: version, runner: { os: env.RUNNER_OS, arch: env.RUNNER_ARCH, image: env.ImageOS, imageVersion: env.ImageVersion }, workflow_sha: env.GITHUB_WORKFLOW_SHA, event_sha: env.GITHUB_SHA, checkout_sha: git(root, ["rev-parse", "HEAD"]), ref: env.GITHUB_REF, run_id: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT });
}

async function policy(root) {
  const env = process.env;
  if (env.GITHUB_ACTIONS !== "true" || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY ?? "") || !env.GITHUB_TOKEN) fail("Policy preparation requires the GitHub Actions read-only repository context.");
  const identity = eventIdentity(env.GITHUB_EVENT_NAME, JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")), env);
  verifyCheckout(root, identity);
  report({ ...identity, workflow_sha: sha(env.GITHUB_WORKFLOW_SHA), tool_checkout_sha: git(root, ["rev-parse", "HEAD"]) });
  const remote = `https://github.com/${env.GITHUB_REPOSITORY}`;
  const origin = git(root, ["remote", "get-url", "origin"]);
  if (![remote, `${remote}.git`].includes(origin)) fail("CI origin is not the target GitHub repository.");
  const enabled = env.RELEASE_ENABLED === "true";
  const stable = fetchInputs(root, identity, origin, env.GITHUB_TOKEN, { control: enabled, objects: enabled ? [sha(env.RELEASE_CONTROL_ROOT)] : [] });
  const version = commit => JSON.parse(git(root, ["show", `${commit}:.codex-plugin/plugin.json`], true)).version;
  const type = deliveryType(version(identity.base), version(identity.head), version(stable));
  if (!["development", "development-date"].includes(type) && !enabled) fail("Candidate transitions are disabled until platform activation is verified.");
  const delivery = type === "development" ? checkDelivery(root, { ...identity, stable })
    : type === "development-date" ? checkDevelopmentDate(root, { ...identity, stable })
    : await checkCandidateDelivery(root, { ...identity, stable, type }, new GitHub({ repository: env.GITHUB_REPOSITORY, repositoryId: id(Number(env.GITHUB_REPOSITORY_ID)), readToken: env.GITHUB_TOKEN }), env.RELEASE_CONTROL_ROOT);
  report(delivery);
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 3 || !["runtime", "policy"].includes(process.argv[2])) fail("Usage: node scripts/ci.mjs runtime|policy");
    runtime(process.cwd());
    if (process.argv[2] === "policy") await policy(process.cwd());
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
