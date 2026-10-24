import { parseArgs } from "node:util";
import { prepare, verify } from "./release/production.mjs";
import { verifyInstall } from "./release/install.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GitHub, id, digest, json } from "./release/github.mjs";
import { preflight } from "./release/evidence.mjs";
import { prepareHandoff, publish } from "./release/publication.mjs";
import { prepareRecoveryHandoff, resumePublication, recoveryReport } from "./release/recovery.mjs";
import { prepareControlHandoff, executeControl } from "./release/control-actions.mjs";
import { executionContext, workspace } from "./release/workflow.mjs";

let approval;
function recordApproval(value) { approval = value; audit({ status: "approved" }); }

async function publicationCommand(mode, values) {
  const env = process.env, privateKey = env.RELEASE_APP_PRIVATE_KEY;
  delete env.RELEASE_APP_PRIVATE_KEY;
  const api = new GitHub({ repository: env.GITHUB_REPOSITORY, repositoryId: id(Number(env.GITHUB_REPOSITORY_ID)), readToken: env.GITHUB_TOKEN });
  const policy = JSON.parse(env.RELEASE_POLICY ?? "null");
  if (mode === "preflight") return preflight(api, policy);
  if (mode === "recovery-report") return recoveryReport(api, values.root ?? process.cwd(), JSON.parse(env.RELEASE_INPUT ?? "null"), policy);
  if (["discover", "discover-recovery", "discover-control"].includes(mode)) {
    const input = JSON.parse(env.RELEASE_INPUT ?? "null");
    const handoff = mode === "discover-control" ? await prepareControlHandoff(api, input, policy) : await (mode === "discover" ? prepareHandoff : prepareRecoveryHandoff)(api, values.root ?? process.cwd(), input, policy);
    return { handoff, handoff_sha256: digest(json(handoff)) };
  }
  const control = ["retire-candidate", "control-recover"].includes(mode);
  const job = { "retire-candidate": "guard", "control-recover": "control_recover" }[mode] ?? "publish";
  if (env.GITHUB_JOB !== job || (control && env.GITHUB_EVENT_NAME !== "workflow_dispatch")) throw new Error("Publication requires the trusted protected develop job.");
  const execution = executionContext(values.root ?? process.cwd(), env);
  if (control) {
    const handoff = JSON.parse(env.RELEASE_HANDOFF ?? "null");
    if (handoff?.mode !== mode) throw new Error("Protected control operation differs from the approved handoff.");
    return executeControl(api, handoff, env.RELEASE_HANDOFF_SHA256, policy, execution, privateKey, recordApproval);
  }
  return (mode === "publish" ? publish : resumePublication)(api, values.root ?? process.cwd(), JSON.parse(env.RELEASE_HANDOFF ?? "null"), env.RELEASE_HANDOFF_SHA256, policy, execution, privateKey, recordApproval);
}

function audit(value) {
  if (process.env.GITHUB_ACTIONS !== "true" || !["publish", "guard", "control_recover"].includes(process.env.GITHUB_JOB)) return;
  const folder = join(process.cwd(), workspace, "audit"); mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "outcome.json"), json({ ...value, ...(approval ? { approval } : {}) }));
}

if (import.meta.main) {
  try {
    const mode = process.argv[2];
    const common = ["root", "source-sha", "base-sha"];
    const publication = ["preflight", "discover", "publish", "recovery-report", "discover-recovery", "resume", "discover-control", "retire-candidate", "control-recover"].includes(mode);
    const fields = publication ? ["root"] : mode === "prepare" ? [...common, "output-dir"] : ["verify", "verify-install"].includes(mode) ? [...common, "bundle-dir", "tree-sha", "archive-sha256", "manifest-sha256"] : [];
    if (!fields.length) throw new Error("Usage: release.mjs prepare|verify|verify-install; publication and control commands use trusted workflow handoffs.");
    const { values } = parseArgs({ args: process.argv.slice(3), options: Object.fromEntries(fields.map(key => [key, { type: "string" }])), strict: true, allowPositionals: false });
    for (const key of fields) if (key !== "root" && !values[key]) throw new Error(`Missing --${key}.`);
    const options = { source: values["source-sha"], base: values["base-sha"], output: values["output-dir"], bundle: values["bundle-dir"], expected: { production_tree_sha: values["tree-sha"], archive_sha256: values["archive-sha256"], manifest_sha256: values["manifest-sha256"] } };
    const result = publication ? await publicationCommand(mode, values) : await ({ prepare, verify, "verify-install": verifyInstall }[mode])(values.root ?? process.cwd(), options);
    audit(result);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "blocked") process.exitCode = 1;
  } catch (error) { audit({ status: "unconfirmed", reason: error.message }); console.error(`Release operation failed: ${error.message}`); process.exitCode = 1; }
}
