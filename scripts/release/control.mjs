import { isDeepStrictEqual } from "node:util";
import { checkIncrement, parseVersion } from "../check-version.mjs";
import { ApiError, digest, json, reject, exactKeys, objectSha, hash, id, utc, nowUTC } from "./github.mjs";

const keys = "schema_version repository_id root_sha previous_sha sequence retired_sources owner intent record".split(" ");
const ownerKeys = "run_id job_id run_attempt operation source_sha version workflow_sha tool_sha token_expires_at".split(" ");
const same = (a, b) => { if (!isDeepStrictEqual(a, b)) reject("Control transition changes unrelated state."); };
const ownerKey = owner => `${owner.run_id}/${owner.job_id}/${owner.run_attempt}`;
const historyLimit = 10000;

export function validateOwner(owner) {
  exactKeys(owner, ownerKeys);
  for (const key of ["run_id", "job_id", "run_attempt"]) id(owner[key]);
  for (const key of ["source_sha", "workflow_sha", "tool_sha"]) objectSha(owner[key]);
  if (!["publish", "retire-candidate", "control-recover"].includes(owner.operation)) reject("Unsupported control operation.");
  parseVersion(owner.version, "stable"); utc(owner.token_expires_at); return owner;
}

export function validateIntent(intent) {
  exactKeys(intent, ["target", "request_sha256", "data"]); hash(intent.request_sha256);
  const fields = {
    main: ["before_sha", "after_sha"], tag: ["tag_name", "object_sha", "commit_sha"],
    draft: ["tag_name", "commit_sha", "body_sha256"], asset: ["release_id", "name", "size", "sha256"],
    publish: ["release_id", "tag_name", "commit_sha", "body_sha256"],
  }[intent.target];
  if (!fields) reject("Unsupported business target.");
  exactKeys(intent.data, fields);
  for (const [key, value] of Object.entries(intent.data)) {
    if (["before_sha", "after_sha", "object_sha", "commit_sha"].includes(key)) objectSha(value);
    if (["body_sha256", "sha256"].includes(key)) hash(value);
    if (key === "release_id") id(value);
    if (key === "size" && (!Number.isSafeInteger(value) || value < 0)) reject("Invalid asset size.");
    if (key === "tag_name" && (typeof value !== "string" || !value.startsWith("v"))) reject("Invalid formal tag.");
    if (key === "tag_name") parseVersion(value.slice(1), "stable");
    if (key === "name" && !/^(?:affinity-mcp-\d+\.\d+\.\d+\.zip|release-manifest\.json|SHA256SUMS)$/.test(value)) reject("Unexpected release asset name.");
  }
  return intent;
}

export function validateReceipt(receipt) {
  exactKeys(receipt, "source_sha production_base_sha version release_date production_tree_sha recipe_version recipe_tool_sha manifest_sha256 archive_sha256 ci".split(" "));
  for (const key of ["source_sha", "production_base_sha", "production_tree_sha", "recipe_tool_sha"]) objectSha(receipt[key]);
  for (const key of ["manifest_sha256", "archive_sha256"]) hash(receipt[key]);
  parseVersion(receipt.version, "stable"); utc(`${receipt.release_date}T00:00:00Z`);
  if (receipt.recipe_version !== "1") reject("Unsupported receipt recipe.");
  const ci = receipt.ci;
  exactKeys(ci, "repository_id workflow_id workflow_path workflow_sha ref head_branch head_sha event run_id run_attempt job_id check_id check_name check_app_id completed_at check_set_version ref_evidence".split(" "));
  for (const key of ["repository_id", "workflow_id", "run_id", "run_attempt", "job_id", "check_id", "check_app_id"]) id(ci[key]);
  objectSha(ci.workflow_sha); objectSha(ci.head_sha); utc(ci.completed_at);
  if (ci.workflow_path !== ".github/workflows/docs-hooks.yml" || ci.ref !== "refs/heads/develop" || ci.head_branch !== "develop" || ci.event !== "push" || ci.head_sha !== receipt.source_sha || ci.check_name !== "Repository checks / required" || ci.check_set_version !== "1") reject("Receipt does not identify the required develop push CI.");
  exactKeys(ci.ref_evidence, ["run_id", "run_attempt", "artifact_id", "artifact_digest"]);
  id(ci.ref_evidence.artifact_id); hash(ci.ref_evidence.artifact_digest);
  if (ci.ref_evidence.run_id !== ci.run_id || ci.ref_evidence.run_attempt !== ci.run_attempt) reject("Original ref evidence identifies another attempt.");
  return receipt;
}

export function genesis(repositoryId, recipeTool) {
  return { schema_version: 1, repository_id: id(repositoryId), root_sha: null, previous_sha: null, sequence: 0, retired_sources: [], owner: null, intent: null,
    record: { type: "genesis", data: { recipe_version: "1", tool_sha: objectSha(recipeTool), node_version: "24.22.1" } } };
}

export function validateHistory(history, { repositoryId, root }) {
  objectSha(root); id(repositoryId);
  if (!Array.isArray(history) || !history.length) reject("Complete control history is required.");
  const seenOwners = new Set(); let previous, successfulRequest = false;
  for (const entry of history) {
    const { sha, parents, state } = entry; objectSha(sha); exactKeys(state, keys);
    if (state.schema_version !== 1 || state.repository_id !== repositoryId || state.sequence !== (previous ? previous.state.sequence + 1 : 0)) reject("Unsupported or foreign control history.");
    if (!Array.isArray(state.retired_sources)) reject("Invalid retired source collection.");
    state.retired_sources.forEach(objectSha); same(state.retired_sources, [...new Set(state.retired_sources)].sort());
    if (state.owner !== null) validateOwner(state.owner);
    if (state.intent !== null) validateIntent(state.intent);
    exactKeys(state.record, ["type", "data"]);
    if (!previous) {
      same(parents, []); same(state, genesis(repositoryId, state.record.data?.tool_sha));
      if (sha !== root) reject("Control root does not match the independently pinned genesis.");
    } else {
      same(parents, [previous.sha]);
      if (state.root_sha !== root || state.previous_sha !== previous.sha) reject("Control predecessor or root differs.");
      const before = previous.state, { type, data } = state.record;
      if (type !== "retire") same(state.retired_sources, before.retired_sources);
      if (!["claim", "terminal", "recover"].includes(type)) same(state.owner, before.owner);
      if (!["intent", "result", "recover"].includes(type)) same(state.intent, before.intent);
      if (type === "claim") {
        if (before.owner || before.intent || !state.owner || state.owner.operation === "control-recover" || seenOwners.has(ownerKey(state.owner))) reject("Owner cannot be claimed or reused.");
        if (before.retired_sources.includes(state.owner.source_sha)) reject("Retired candidates cannot claim a new operation.");
        same(data, null); same(state.intent, null);
        successfulRequest = false;
      } else if (type === "intent") {
        if (!before.owner || before.owner.operation !== "publish" || before.intent || !state.intent) reject("Business request requires an exclusive idle publisher.");
        if (before.retired_sources.includes(before.owner.source_sha)) reject("Retired candidates cannot submit business requests.");
        if (state.intent.data.tag_name && state.intent.data.tag_name !== `v${before.owner.version}`) reject("Intent tag differs from owner.");
        same(data, null);
      } else if (type === "result") {
        if (!before.owner || !before.intent || state.intent !== null) reject("No pending request to resolve.");
        exactKeys(data, ["request_sha256", "outcome", "evidence_sha256"]); hash(data.evidence_sha256);
        if (data.request_sha256 !== before.intent.request_sha256 || !["success", "rejected"].includes(data.outcome)) reject("Result does not resolve the exact request.");
        if (data.outcome === "success") successfulRequest = true;
      } else if (type === "receipt") {
        if (!before.owner || before.owner.operation !== "publish" || before.intent) reject("Receipt requires a publisher with no pending request.");
        validateReceipt(data);
        if (data.source_sha !== before.owner.source_sha || data.version !== before.owner.version || data.ci.repository_id !== repositoryId || data.recipe_tool_sha !== history[0].state.record.data.tool_sha) reject("Receipt differs from owner or pinned recipe.");
      } else if (type === "retire") {
        if (!before.owner || before.owner.operation !== "retire-candidate" || before.intent) reject("Retirement requires the exclusive guard.");
        exactKeys(data, ["source_sha", "version", "reason", "main_sha"]); objectSha(data.main_sha);
        if (data.source_sha !== before.owner.source_sha || data.version !== before.owner.version || !["date-revision", "withdraw"].includes(data.reason) || before.retired_sources.includes(data.source_sha)) reject("Retirement identity differs or is already recorded.");
        same(state.retired_sources, [...before.retired_sources, data.source_sha].sort());
      } else if (type === "terminal") {
        if (!before.owner || before.intent || state.owner !== null || !["complete", "retired", "rejected"].includes(data)) reject("An unresolved operation cannot become idle.");
        if (before.owner.operation === "retire-candidate" && data !== (before.retired_sources.includes(before.owner.source_sha) ? "retired" : "rejected")) reject("Terminal disagrees with permanent retirement.");
        if (before.owner.operation === "publish" && data === "retired") reject("Publisher cannot report a guard terminal.");
        if (before.owner.operation === "publish" && data === "complete" && !successfulRequest) reject("Completion requires a successful request; use rejected for an empty operation.");
      } else if (type === "recover") {
        if (!before.owner || state.owner !== null || state.intent !== null) reject("Recovery requires an abandoned owner.");
        exactKeys(data, ["previous_owner", "recovery_actor", "job_status", "checked_at", "resolution", "evidence_sha256"]);
        same(data.previous_owner, before.owner); validateOwner(data.recovery_actor); utc(data.checked_at); hash(data.evidence_sha256);
        if (data.recovery_actor.operation !== "control-recover" || data.recovery_actor.source_sha !== before.owner.source_sha || data.recovery_actor.version !== before.owner.version || seenOwners.has(ownerKey(data.recovery_actor)) || data.job_status !== "completed" || Date.parse(data.checked_at) < Date.parse(before.owner.token_expires_at)) reject("Recovery lacks terminated-job and expired-token evidence.");
        if (data.resolution !== (before.intent ? "exact-success" : "no-pending-request")) reject("Unknown requests cannot be cleared by recovery.");
        seenOwners.add(ownerKey(data.recovery_actor));
      } else reject("Unsupported control transition.");
    }
    if (state.record.type === "claim") seenOwners.add(ownerKey(state.owner));
    previous = entry;
  }
  return previous;
}

export class Control {
  constructor(api, root, actor) { this.api = api; this.root = objectSha(root); this.actor = actor && validateOwner(actor); this.held = false; this.closed = false; this.objects = new Map(); }
  async read() {
    await this.api.identity();
    let sha = await this.api.ref("heads/release-control"); const history = [], visited = new Set();
    // shortcut: validate up to 10000 control commits, add audited checkpoints before exceeding that history.
    while (history.length < historyLimit) {
      if (visited.has(sha)) reject("Cyclic control history."); visited.add(sha);
      let entry = this.objects.get(sha);
      if (!entry) {
        const commit = await this.api.commit(sha), entries = await this.api.tree(commit.tree.sha);
        if (entries.length !== 1 || entries[0].path !== "control.json" || entries[0].type !== "blob" || entries[0].mode !== "100644") reject("Control branch must contain only protocol data.");
        const bytes = await this.api.blob(entries[0].sha); let state;
        try { state = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { reject("Invalid control JSON."); }
        if (!json(state).equals(bytes)) reject("Control data must use canonical UTF-8 JSON.");
        entry = { sha, parents: commit.parents.map(parent => parent.sha), state }; this.objects.set(sha, entry);
      }
      history.unshift(entry);
      if (sha === this.root) break;
      if (entry.parents.length !== 1) reject("Control history must be complete and linear.");
      sha = entry.parents[0];
    }
    const tip = validateHistory(history, { root: this.root, repositoryId: this.api.repositoryId });
    return { tip, history };
  }
  async append(current, type, data, changes = {}) {
    if (this.closed || !this.actor || Date.now() >= Date.parse(this.actor.token_expires_at)) reject("This control attempt cannot write again.");
    await this.api.identity({ writable: true });
    const latest = await this.read();
    if (latest.tip.sha !== current.tip.sha) { this.closed = true; reject("Control predecessor changed; this attempt has lost eligibility."); }
    // Seven publish requests need 14 records plus claim, receipt and terminal; every intent also reserves its result and terminal.
    const requiredSlots = type === "claim" ? (this.actor.operation === "publish" ? 17 : 3) : type === "intent" ? 3 : ["terminal", "recover"].includes(type) ? 1 : 2;
    if (current.history.length + requiredSlots > historyLimit) reject("Control history capacity is insufficient; no update was submitted.");
    const state = { ...structuredClone(current.tip.state), root_sha: this.root, previous_sha: current.tip.sha, sequence: current.tip.state.sequence + 1, ...changes, record: { type, data } };
    validateHistory([...current.history, { sha: "1".repeat(40), parents: [current.tip.sha], state }], { root: this.root, repositoryId: this.api.repositoryId });
    const post = (path, body) => this.api.request("POST", this.api.path + path, body);
    const blob = await post("/git/blobs", { content: json(state).toString("base64"), encoding: "base64" });
    const tree = await post("/git/trees", { tree: [{ path: "control.json", mode: "100644", type: "blob", sha: objectSha(blob.sha) }] });
    const commit = await post("/git/commits", { message: `Release control: ${type}`, tree: objectSha(tree.sha), parents: [current.tip.sha] });
    objectSha(commit.sha);
    try { await this.api.request("PATCH", this.api.path + "/git/refs/heads/release-control", { sha: commit.sha, force: false }); }
    catch { /* A response can be lost after the ref update; only exact read-back grants eligibility. */ }
    let confirmed;
    try { confirmed = await this.read(); } catch (error) { this.closed = true; throw error; }
    if (confirmed.tip.sha !== commit.sha || !isDeepStrictEqual(confirmed.tip.state, state)) { this.closed = true; reject("Control update was not confirmed; no business write is authorized."); }
    return confirmed;
  }
  async claim(expectedTip) {
    if (this.closed || this.held) reject("This attempt cannot reclaim ownership.");
    const current = await this.read();
    if (expectedTip && current.tip.sha !== objectSha(expectedTip)) reject("Approved control predecessor changed.");
    if (current.tip.state.owner || current.tip.state.intent) reject("Existing owner requires control recovery.");
    const next = await this.append(current, "claim", null, { owner: this.actor });
    this.held = true; this.current = next; return next;
  }
  async owned() {
    if (!this.held || this.closed || Date.now() >= Date.parse(this.actor.token_expires_at)) reject("No live confirmed owner in this process.");
    const current = await this.read();
    if (current.tip.sha !== this.current.tip.sha || !isDeepStrictEqual(current.tip.state.owner, this.actor)) { this.closed = true; reject("Owner is no longer current."); }
    return current;
  }
  async record(type, data, changes) {
    this.current = await this.append(await this.owned(), type, data, changes); return this.current.tip.sha;
  }
  async intent(intent) { validateIntent(intent); return this.record("intent", null, { intent }); }
  async result(outcome, evidence) {
    const current = await this.owned();
    if (!current.tip.state.intent) reject("No request is pending.");
    return this.record("result", { request_sha256: current.tip.state.intent.request_sha256, outcome, evidence_sha256: digest(json(evidence)) }, { intent: null });
  }
  async receipt(receipt) { return this.record("receipt", validateReceipt(receipt)); }
  async finish(outcome) {
    const current = await this.owned(), targets = new Map();
    if (current.tip.state.intent) reject("An unresolved operation cannot become idle.");
    for (let i = 1; i < current.history.length; i++) {
      const { state } = current.history[i];
      if (state.record.type !== "result" || state.record.data.outcome !== "success" || !isDeepStrictEqual(state.owner, this.actor)) continue;
      const intent = current.history[i - 1].state.intent, { target, data } = intent;
      const key = target === "asset" ? `asset:${data.release_id}/${data.name}` : target === "main" ? "main" : target === "tag" ? `tag:${data.tag_name}` : `release:${data.tag_name}`;
      targets.set(key, intent);
    }
    for (const intent of targets.values()) if (!await observeIntent(this.api, intent)) reject("Successful request final state no longer agrees; owner retained.");
    const sha = await this.record("terminal", outcome, { owner: null }); this.held = false; this.closed = true; return sha;
  }
  async retire(reason) {
    await this.owned();
    if (this.actor.operation !== "retire-candidate") reject("Only a guard may retire a candidate.");
    const facts = await unissuedCandidate(this.api, this.actor.source_sha, this.actor.version);
    const source = this.actor.source_sha;
    const sha = await this.record("retire", { source_sha: source, version: this.actor.version, reason, main_sha: facts.main_sha }, { retired_sources: [...this.current.tip.state.retired_sources, source].sort() });
    await this.finish("retired"); return { status: "retired", source_sha: source, retirement_commit: sha };
  }
  async recoveryFacts() {
    const current = await this.read(), before = current.tip.state;
    if (!before.owner) reject("Recovery requires an abandoned owner.");
    const job = await this.api.get(`/actions/jobs/${before.owner.job_id}`);
    if (job.id !== before.owner.job_id || job.run_id !== before.owner.run_id || job.status !== "completed" || Date.now() < Date.parse(before.owner.token_expires_at)) reject("Old job termination and token expiry are not both confirmed.");
    const member = (await this.api.jobs(before.owner.run_id, before.owner.run_attempt)).find(item => item.id === job.id);
    if (!member || member.status !== "completed") reject("Old job is not confirmed completed in the exact attempt.");
    const observed = before.intent ? await observeIntent(this.api, before.intent) : { status: "no-pending-request" };
    if (before.intent && !observed) reject("Old request remains unknown; recovery cannot clear it.");
    return { current, resolution: before.intent ? "exact-success" : "no-pending-request", evidence: { job_id: job.id, run_id: job.run_id, run_attempt: before.owner.run_attempt, status: job.status, observed } };
  }
  async recover(expectedTip) {
    if (this.actor?.operation !== "control-recover") reject("Recovery requires a new recovery run.");
    const { current, resolution, evidence } = await this.recoveryFacts();
    if (expectedTip && current.tip.sha !== objectSha(expectedTip)) reject("Approved control predecessor changed.");
    const data = { previous_owner: current.tip.state.owner, recovery_actor: this.actor, job_status: "completed", checked_at: nowUTC(), resolution, evidence_sha256: digest(json(evidence)) };
    const next = await this.append(current, "recover", data, { owner: null, intent: null }); this.closed = true;
    return { status: "idle", control_sha: next.tip.sha, resolution: data.resolution };
  }
}

export async function unissuedCandidate(api, source, version) {
  objectSha(source); parseVersion(version, "stable"); await api.identity({ writable: true });
  if (await api.ref("heads/develop") !== source || await api.version(source) !== version) reject("Guard requires the exact current stable candidate.");
  const facts = await unissuedTargets(api, version);
  if (await api.ref("heads/develop") !== source) reject("Candidate state changed during guard verification.");
  return { source_sha: source, ...facts };
}

export async function unissuedTargets(api, version, expectedMain) {
  parseVersion(version, "stable"); await api.identity();
  const main = await api.ref("heads/main"), prior = await api.version(main);
  if (expectedMain && main !== expectedMain) reject("Formal baseline differs from the exact current main.");
  if (prior === version) reject("Candidate is already delivered on main.");
  checkIncrement(version, prior, undefined, "stable");
  const tags = await api.list(`/git/matching-refs/tags/v${version}`), releases = await api.list("/releases");
  for (const tag of tags) {
    if (typeof tag?.ref !== "string" || !tag.ref.startsWith(`refs/tags/v${version}`) || !["commit", "tag"].includes(tag.object?.type)) reject("Unconfirmed tag enumeration.");
    objectSha(tag.object.sha);
  }
  for (const release of releases) {
    if (typeof release?.tag_name !== "string" || typeof release.draft !== "boolean") reject("Unconfirmed Release enumeration.");
    id(release.id);
  }
  if (tags.some(tag => tag.ref === `refs/tags/v${version}`) || releases.some(release => release.tag_name === `v${version}` && release.draft === false)) reject("Candidate already has a formal tag or public Release.");
  if (await api.ref("heads/main") !== main) reject("Candidate state changed during target verification.");
  return { version, main_sha: main };
}

export async function observeIntent(api, intent) {
  validateIntent(intent); const data = intent.data;
  if (intent.target === "main") {
    const commit = await api.commit(data.after_sha);
    return isDeepStrictEqual(commit.parents.map(parent => parent.sha), [data.before_sha]) && await api.ref("heads/main") === data.after_sha ? { commit_sha: data.after_sha } : null;
  }
  if (intent.target === "tag") {
    const tags = await api.list(`/git/matching-refs/tags/${data.tag_name}`), ref = tags.find(tag => tag.ref === `refs/tags/${data.tag_name}`);
    if (!ref || ref.object?.type !== "tag" || ref.object.sha !== data.object_sha) return null;
    const tag = await api.get(`/git/tags/${data.object_sha}`);
    return tag.sha === data.object_sha && tag.tag === data.tag_name && tag.object?.type === "commit" && tag.object.sha === data.commit_sha ? { tag_sha: tag.sha, commit_sha: data.commit_sha } : null;
  }
  if (intent.target === "asset") {
    const assets = await api.list(`/releases/${data.release_id}/assets`), matches = assets.filter(asset => asset.name === data.name);
    if (matches.length !== 1 || matches[0].size !== data.size || matches[0].state !== "uploaded") return null;
    const bytes = await api.get(`/releases/assets/${id(matches[0].id)}`, { raw: true });
    return bytes.length === data.size && digest(bytes) === data.sha256 ? { asset_id: matches[0].id, sha256: data.sha256 } : null;
  }
  const releases = await api.list("/releases"), matches = releases.filter(release => release.tag_name === data.tag_name);
  if (matches.length !== 1) return null;
  const release = matches[0];
  if (release.target_commitish !== data.commit_sha || release.prerelease !== false || typeof release.body !== "string" || digest(Buffer.from(release.body)) !== data.body_sha256 || release.draft !== (intent.target === "draft") || (intent.target === "publish" && release.id !== data.release_id)) return null;
  if (intent.target === "publish" && (release.immutable !== true || (await api.get("/releases/latest")).id !== release.id)) return null;
  return { release_id: id(release.id), draft: release.draft, body_sha256: data.body_sha256 };
}

export async function businessWrite(control, intent, method, path, body, beforeSubmit) {
  const data = validateIntent(intent).data;
  const upload = intent.target === "asset";
  if (upload) {
    if (!Buffer.isBuffer(body) || body.length !== data.size || digest(body) !== data.sha256) reject("Asset bytes do not match their target contract.");
    body = Buffer.from(body);
  }
  const required = {
    main: ["PATCH", "/git/refs/heads/main", { sha: data.after_sha, force: false }],
    tag: ["POST", "/git/refs", { ref: `refs/tags/${data.tag_name}`, sha: data.object_sha }],
    draft: ["POST", "/releases", { tag_name: data.tag_name, target_commitish: data.commit_sha, name: data.tag_name, body: body?.body, draft: true, prerelease: false }],
    asset: ["POST", `/releases/${data.release_id}/assets?name=${encodeURIComponent(data.name)}`, body],
    publish: ["PATCH", `/releases/${data.release_id}`, { draft: false, prerelease: false, make_latest: "true" }],
  }[intent.target];
  if (!required || !isDeepStrictEqual([method, path, body], required) || (intent.target === "draft" && (typeof body.body !== "string" || digest(Buffer.from(body.body)) !== data.body_sha256))) reject("Business request does not match its target contract.");
  if (digest(json({ method, path, body: upload ? { size: data.size, sha256: data.sha256 } : body })) !== intent.request_sha256) reject("Request differs from its durable intent.");
  if (upload) {
    const release = await control.api.get(`/releases/${data.release_id}`);
    if (release.id !== data.release_id || release.draft !== true) reject("Asset destination must be the exact draft Release.");
    if (release.upload_url !== `https://uploads.github.com${control.api.path}/releases/${data.release_id}/assets{?name,label}`) reject("Unconfirmed asset upload URL.");
  }
  if (intent.target === "main") {
    if (await control.api.ref("heads/main") !== data.before_sha) reject("Main precondition differs; no business request submitted.");
    if (!isDeepStrictEqual((await control.api.commit(data.after_sha)).parents.map(parent => parent.sha), [data.before_sha])) reject("Production commit must have the exact main base as its only parent.");
  }
  await control.intent(intent);
  await control.owned(); await control.api.identity({ writable: true });
  if (intent.target === "main") {
    const before = await control.api.ref("heads/main");
    if (before !== data.before_sha) {
      await control.result("rejected", { reason: "precondition-changed-before-submission", observed_sha: before });
      reject("Main precondition changed; no business request submitted.");
    }
  }
  let response;
  if (beforeSubmit) {
    try { await beforeSubmit(); }
    catch (error) {
      await control.result("rejected", { reason: "final-precondition-failed-before-submission" });
      throw error;
    }
  }
  try { response = await control.api.request(method, control.api.path + path, body, { upload }); }
  catch (error) {
    if (error instanceof ApiError && error.status === 422) {
      await control.result("rejected", { request_sha256: intent.request_sha256, status: 422 });
      reject("Business request was definitively rejected; no retry was attempted.");
    }
    // Other failures do not prove that a business request was never submitted.
  }
  const observed = await observeIntent(control.api, intent);
  if (!observed) reject("Business result remains unknown; durable intent retained and no retry performed.");
  await control.result("success", observed); return { response, observed };
}
