import { readFileSync, writeFileSync, renameSync, openSync, closeSync, fsyncSync, mkdirSync, realpathSync, existsSync } from "node:fs";
import { dirname, basename, resolve, relative, join } from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { dispatchInput } from "../ci.mjs";
import { GitHub, ApiError, id, objectSha, reject, json } from "./github.mjs";
import { workflowPath } from "./evidence.mjs";
import { Control } from "./control.mjs";

export function journalWriter(path, cwd = process.cwd()) {
  let root;
  try { root = realpathSync(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8", stdio: "pipe" }).trim()); }
  catch { reject("Entry journal requires a local repository checkout."); }
  path = resolve(path);
  let parent = dirname(path); const missing = [];
  while (!existsSync(parent)) { missing.unshift(basename(parent)); parent = dirname(parent); }
  path = join(realpathSync(parent), ...missing, basename(path));
  const local = relative(root, path).replaceAll("\\", "/");
  if (!/^\.scratch\/ai-agent-[^/]+\/.+/.test(local)) reject("Entry journal must be inside this checkout's .scratch/ai-agent- directory.");
  try { execFileSync("git", ["check-ignore", "--no-index", "--quiet", "--", local], { cwd: root, stdio: "pipe" }); }
  catch { reject("Entry journal must be ignored by Git."); }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, json({ status: "reserved" }), { flag: "wx", mode: 0o600 });
  return value => {
    const temporary = path + ".tmp";
    writeFileSync(temporary, json(value), { flag: "w", mode: 0o600 });
    const file = openSync(temporary, "r"); try { fsyncSync(file); } finally { closeSync(file); }
    renameSync(temporary, path);
  };
}

export async function dispatchEntry(api, raw, workflowId, controlRoot, persist) {
  const input = dispatchInput({ ...raw, entry_id: raw.entry_id ?? randomBytes(16).toString("hex") });
  objectSha(input.expected_tool_sha); id(workflowId);
  const record = { schema_version: 1, repository: api.repository, repository_id: api.repositoryId, workflow_id: workflowId, original_default: "main", ref: "develop", inputs: input, status: "preflight", direct: null, fallback: null, run: null, default_restored: false };
  const save = status => { record.status = status; persist(record); };
  const repo = async () => {
    const value = await api.get("");
    if (value.id !== api.repositoryId || value.full_name?.toLowerCase() !== api.repository.toLowerCase() || value.permissions?.admin !== true) reject("Entry requires the target repository maintainer administration identity.");
    return value;
  };
  save("preflight");
  if ((await repo()).default_branch !== "main") reject("Entry starts only with default branch main; inspect any existing entry journal.");
  const workflow = await api.get(`/actions/workflows/${workflowId}`);
  if (workflow.id !== workflowId || workflow.path !== workflowPath || workflow.state !== "active") reject("Entry workflow registration is unavailable.");
  if (await api.ref("heads/develop") !== input.expected_tool_sha) reject("Reviewed develop tool has moved before dispatch.");
  const main = await api.ref("heads/main"), mainTree = await api.tree((await api.commit(main)).tree.sha, true);
  if (mainTree.some(file => file.path === workflowPath)) reject("Entry expects the approved production-only main tree.");
  if (!(await api.tree((await api.commit(input.expected_tool_sha)).tree.sha, true)).some(file => file.path === workflowPath && file.mode === "100644" && file.type === "blob")) reject("Develop is missing the reviewed workflow.");
  const checkControl = async () => { if (input.operation !== "ci") {
    const reader = new Control(api, objectSha(controlRoot)), state = await reader.read();
    if (input.operation === "control-recover") {
      const facts = await reader.recoveryFacts();
      if (facts.current.tip.state.owner.source_sha !== input.source_sha || facts.current.tip.state.owner.version !== input.version) reject("Control recovery input differs from the recorded owner.");
    } else if (state.tip.state.owner || state.tip.state.intent) reject("Old ownership must be reconciled before a new production entry.");
  } };
  await checkControl();
  const readRun = async runId => {
    const run = await api.get(`/actions/runs/${id(runId)}`);
    if (run.id !== runId || run.workflow_id !== workflowId || run.repository?.id !== api.repositoryId || run.head_repository?.id !== api.repositoryId || run.event !== "workflow_dispatch" || run.head_branch !== "develop" || run.head_sha !== input.expected_tool_sha || run.display_title !== `CI/CD ${input.entry_id}` || ![workflowPath, `${workflowPath}@refs/heads/develop`, `${workflowPath}@develop`].includes(run.path)) reject("Dispatched run identity is not confirmed.");
    return { id: run.id, url: `https://github.com/${api.repository}/actions/runs/${run.id}`, head_sha: run.head_sha, event: run.event, head_branch: run.head_branch, entry_id: input.entry_id };
  };
  const locate = async () => {
    const runs = await api.collection(`/actions/workflows/${workflowId}/runs?event=workflow_dispatch&branch=develop&head_sha=${input.expected_tool_sha}`, "workflow_runs");
    const matches = runs.filter(run => run.display_title === `CI/CD ${input.entry_id}`);
    if (matches.length !== 1) reject("Dispatch result remains unknown; inspect the journal and read-only run list, do not dispatch again.");
    return readRun(matches[0].id);
  };
  const submit = async kind => {
    if (await api.ref("heads/develop") !== input.expected_tool_sha) reject("Reviewed develop tool moved before dispatch.");
    save(`${kind}-dispatch-intent`);
    let result;
    try { result = await api.request("POST", api.path + `/actions/workflows/${workflowId}/dispatches`, { ref: "develop", inputs: input }); }
    catch (error) {
      record[kind] = { result: error instanceof ApiError && error.status ? `HTTP ${error.status}` : "unknown" }; save(`${kind}-dispatch-response`);
      if (kind === "direct" && error instanceof ApiError && [404, 422].includes(error.status)) return null;
      if (!(error instanceof ApiError) || error.status === null || error.status >= 500) return { unknown: true };
      throw error;
    }
    record[kind] = { result: "accepted" }; save(`${kind}-dispatch-response`);
    return result?.workflow_run_id ? { id: id(result.workflow_run_id) } : { unknown: true };
  };
  const direct = await submit("direct");
  if (direct) { record.run = direct.id ? await readRun(direct.id) : await locate(); record.default_restored = (await repo()).default_branch === "main"; save(record.default_restored ? "confirmed" : "default-unconfirmed"); if (!record.default_restored) reject("Default branch is not main; production remains blocked."); return record; }
  const rejectedRuns = await api.collection(`/actions/workflows/${workflowId}/runs?event=workflow_dispatch&branch=develop&head_sha=${input.expected_tool_sha}`, "workflow_runs");
  if (rejectedRuns.some(run => run.display_title === `CI/CD ${input.entry_id}`)) reject("Direct rejection conflicts with a matching run; inspect it without dispatching again.");
  // Only an explicit rejected direct dispatch reaches D2; network uncertainty never does.
  let failure, dispatched;
  try {
    if ((await repo()).default_branch !== "main") reject("Default branch changed before the controlled fallback.");
    await checkControl();
    save("fallback-default-change-intent");
    await api.request("PATCH", api.path, { default_branch: "develop" });
    if ((await repo()).default_branch !== "develop") reject("Temporary default branch change is unconfirmed.");
    save("fallback-default-confirmed"); dispatched = await submit("fallback");
  } catch (error) { failure = error; }
  finally {
    try {
      const current = (await repo()).default_branch;
      if (current === "develop") { save("default-restore-intent"); await api.request("PATCH", api.path, { default_branch: "main" }); }
      else if (current !== "main") reject("Another maintainer changed the default branch; do not overwrite it automatically.");
      record.default_restored = (await repo()).default_branch === "main";
      if (!record.default_restored) reject("Default branch restoration is unconfirmed; restore main before any production approval.");
    } catch (error) { failure = error; }
    save(failure ? "blocked" : "default-restored-awaiting-run");
  }
  if (failure) throw failure;
  record.run = dispatched?.id ? await readRun(dispatched.id) : await locate(); save("confirmed");
  return record;
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(["input", "journal", "repository", "repository-id", "workflow-id", "control-root"].map(key => [key, { type: "string" }])), strict: true, allowPositionals: false });
    for (const key of ["input", "journal", "repository", "repository-id", "workflow-id"]) if (!values[key]) reject(`Missing --${key}.`);
    const input = JSON.parse(readFileSync(values.input, "utf8")), persist = journalWriter(values.journal);
    let token; try { token = execFileSync("gh", ["auth", "token", "--hostname", "github.com"], { stdio: "pipe", encoding: "utf8" }).trim(); } catch { reject("Cannot read the maintainer's existing GitHub CLI credential."); }
    const api = new GitHub({ repository: values.repository, repositoryId: id(Number(values["repository-id"])), readToken: token, writeToken: token });
    console.log(JSON.stringify(await dispatchEntry(api, input, id(Number(values["workflow-id"])), values["control-root"], persist), null, 2));
  } catch (error) { console.error(`Controlled entry stopped: ${error.message}`); process.exitCode = 1; }
}
