import { Control, unissuedCandidate } from "./control.mjs";
import { digest, json, exactKeys, objectSha, hash, reject } from "./github.mjs";
import { equal, preflight, validateControlReview } from "./evidence.mjs";
import { executionIdentity, approvalEvidence } from "./publication.mjs";
import { installationToken } from "./app.mjs";
import { parseVersion } from "../check-version.mjs";

export async function prepareControlHandoff(api, input, policy) {
  exactKeys(input, ["mode", "control_root", "source_sha", "version", "reason", "execution", "review"]);
  if (!["retire-candidate", "control-recover"].includes(input.mode) || input.execution?.event !== "workflow_dispatch") reject("Control preparation requires an explicit trusted dispatch operation.");
  objectSha(input.source_sha); parseVersion(input.version, "stable");
  if (input.mode === "retire-candidate" ? !["date-revision", "withdraw"].includes(input.reason) : input.reason !== null) reject("Control reason does not match the operation.");
  await preflight(api, policy); await executionIdentity(api, input.execution, policy);
  await validateControlReview(api, input.review, input.execution);
  const reader = new Control(api, input.control_root);
  let current, facts;
  if (input.mode === "retire-candidate") {
    current = await reader.read();
    if (current.tip.state.owner || current.tip.state.intent || current.tip.state.retired_sources.includes(input.source_sha)) reject("Guard requires an idle, unretired candidate.");
    facts = await unissuedCandidate(api, input.source_sha, input.version);
  } else {
    const recovery = await reader.recoveryFacts(); current = recovery.current;
    equal([current.tip.state.owner.source_sha, current.tip.state.owner.version], [input.source_sha, input.version], "Recovery target differs from the abandoned owner.");
    facts = { resolution: recovery.resolution, evidence: recovery.evidence };
  }
  if ((await reader.read()).tip.sha !== current.tip.sha) reject("Control changed during preparation.");
  await api.identity({ writable: true });
  return { schema_version: 1, ...input, control_sha: current.tip.sha, owner: current.tip.state.owner, intent: current.tip.state.intent, facts, consequence: input.mode === "retire-candidate" ? "This exact source can never be published; the version core remains reusable through a legal new candidate." : "Append only the verified prior request resolution; do not retry a business write.", policy_sha256: digest(json(policy)) };
}

export async function executeControl(api, handoff, expectedDigest, policy, execution, privateKey, recordApproval = () => {}) {
  if (digest(json(handoff)) !== hash(expectedDigest)) reject("Control handoff digest differs.");
  equal(handoff.execution, execution, "Control workflow/tool differs from approval.");
  const input = Object.fromEntries(["mode", "control_root", "source_sha", "version", "reason", "execution", "review"].map(key => [key, handoff[key]]));
  equal(await prepareControlHandoff(api, input, policy), handoff, "Control facts changed since preparation.");
  const approval = await approvalEvidence(api, handoff, policy);
  await recordApproval(approval);
  await api.identity({ writable: true });
  const credential = await installationToken(api, policy, privateKey); api.writeToken = credential.token;
  const actor = { run_id: execution.run_id, job_id: approval.job_id, run_attempt: execution.run_attempt, operation: handoff.mode, source_sha: handoff.source_sha, version: handoff.version, workflow_sha: execution.workflow_sha, tool_sha: execution.tool_sha, token_expires_at: credential.expires_at };
  const control = new Control(api, handoff.control_root, actor);
  let result, failure;
  try {
    if (handoff.mode === "control-recover") result = await control.recover(handoff.control_sha);
    else { await control.claim(handoff.control_sha); result = await control.retire(handoff.reason); }
  } catch (error) {
    failure = error;
    if (control.held && control.current.tip.state.retired_sources.includes(handoff.source_sha)) failure = new Error("Candidate is permanently retired; terminal is unconfirmed. Read control state before explicit recovery.");
    else if (control.held && !control.closed && !control.current.tip.state.intent) { try { await control.finish("rejected"); } catch { /* Retain uncertain ownership for explicit recovery. */ } }
  } finally {
    api.writeToken = undefined;
    try { await credential.revoke(); } catch { failure ??= new Error("Control token revocation is unconfirmed; read back state."); }
  }
  if (failure) throw failure;
  return { ...result, approval, control_sha: control.current?.tip.sha ?? result.control_sha };
}
