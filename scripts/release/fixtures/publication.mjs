import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { generateKeyPairSync, verify } from "node:crypto";
import { fixture } from "./github.mjs";
import { genesis } from "../control.mjs";
import { json, digest } from "../github.mjs";
import { encodeZip } from "../archive.mjs";
import { buildProduction } from "../production.mjs";
import { requiredJobs, workflowPath, installPlatforms, installationProof } from "../evidence.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
export async function publicationFixture(t) {
  const f = await fixture(t), { state } = f;
  const currentVersion = JSON.parse(readFileSync(join(root, ".codex-plugin/plugin.json"))).version;
  const list = JSON.parse(readFileSync(join(root, "scripts/release/production-files.json")));
  const paths = new Set([...list.map(item => item.source), "scripts/release/production-files.json", "docs/README.md", "docs/architecture.md", "docs/sdk/README.md", "docs/versioning.md", workflowPath]);
  const entries = [...paths].map(path => {
    let bytes = readFileSync(join(root, path));
    if ([".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs", "docs/README.md", "docs/architecture.md", "docs/sdk/README.md"].includes(path)) bytes = Buffer.from(bytes.toString().replaceAll(currentVersion, "0.5.4"));
    if (path === "CHANGELOG.md") bytes = Buffer.from("# Changelog\n\n## 2026-10-24\n\n### 0.5.4\n\n#### Changed\n\n- Synthetic release.\n\n### 0.5.3\n\n#### Fixed\n\n- Previous entry.\n");
    if (path === "CHANGELOG.zh-cn.md") bytes = Buffer.from("# 更新日志\n\n## 2026-10-24\n\n### 0.5.4\n\n#### 变更\n\n- 合成发布。\n\n### 0.5.3\n\n#### 修复\n\n- 历史条目。\n");
    return { path, mode: "100644", type: "blob", sha: f.blob(bytes) };
  });
  const development = entries.map(entry => {
    let bytes = f.gitBytes(["cat-file", "blob", entry.sha]);
    if ([".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs", "docs/README.md", "docs/architecture.md", "docs/sdk/README.md"].includes(entry.path)) bytes = Buffer.from(bytes.toString().replaceAll("0.5.4", "0.5.4-dev.1"));
    if (entry.path === "CHANGELOG.md") bytes = Buffer.from("# Changelog\n\n## Unreleased\n\n### 0.5.4-dev.1\n\n#### Changed\n\n- Synthetic development.\n\n## 2026-10-24\n\n### 0.5.3\n\n#### Fixed\n\n- Previous entry.\n");
    if (entry.path === "CHANGELOG.zh-cn.md") bytes = Buffer.from("# 更新日志\n\n## 未发布\n\n### 0.5.4-dev.1\n\n#### 变更\n\n- 合成开发。\n\n## 2026-10-24\n\n### 0.5.3\n\n#### 修复\n\n- 历史条目。\n");
    return { ...entry, sha: f.blob(bytes) };
  });
  f.development = f.commit(f.tree(development), [f.base], "Synthetic development source");
  f.source = f.commit(f.tree(entries), [f.development], "Synthetic stable source");
  f.git("update-ref", "refs/heads/develop", f.source); f.git("symbolic-ref", "HEAD", "refs/heads/develop");
  f.rootSha = f.dataCommit(genesis(123, f.source)); f.git("update-ref", "refs/heads/release-control", f.rootSha);
  const built = buildProduction(f.root, { source: f.source, base: f.base });
  const policy = { environment_id: 51, reviewer_ids: [61], workflow_id: 10, actions_app_id: 15368, app_id: 71, installation_id: 81, bot_id: 91, bot_login: "release-fixture[bot]", rulesets: { develop: 1, mainUpdate: 2, mainSafety: 3, tagCreate: 4, tagSafety: 5, controlUpdate: 6, controlSafety: 7 }, activation_sha256: "f".repeat(64) };
  state.environment = { id: 51, name: "production", deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [{ type: "required_reviewers", prevent_self_review: false, reviewers: [{ type: "User", reviewer: { id: 61 } }] }] };
  state.branches = [{ id: 1, name: "develop", type: "branch" }]; state.rulesets = new Map();
  const definitions = [["branch", "refs/heads/develop", ["pull_request", "required_status_checks", "required_linear_history", "non_fast_forward", "deletion"], false], ["branch", "refs/heads/main", ["update"], true], ["branch", "refs/heads/main", ["non_fast_forward", "deletion"], false], ["tag", "refs/tags/v*", ["creation"], true], ["tag", "refs/tags/v*", ["update", "deletion"], false], ["branch", "refs/heads/release-control", ["creation", "update"], true], ["branch", "refs/heads/release-control", ["non_fast_forward", "deletion"], false]];
  definitions.forEach(([target, ref, types, bypass], i) => state.rulesets.set(i + 1, { id: i + 1, source_type: "Repository", source: "test/repository", enforcement: "active", target, conditions: { ref_name: { include: [ref], exclude: [] } }, bypass_actors: bypass ? [{ actor_id: 71, actor_type: "Integration", bypass_mode: "always" }] : [], rules: types.map(type => ({ type, ...(type === "required_status_checks" ? { parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Repository checks / required", integration_id: 15368 }] } } : {}) })) }));
  state.runs = new Map([["101/1", { id: 101, run_attempt: 1, repository: { id: 123 }, head_repository: { id: 123 }, head_branch: "develop", head_sha: f.source, workflow_id: 10, path: workflowPath, event: "push", check_suite_id: 111, status: "in_progress", conclusion: null }]]);
  state.checks = new Map();
  const names = [...requiredJobs, "Prepare release", "Install archive (windows-latest)", "Install archive (macos-latest)", "Install archive (ubuntu-latest)", "Release approval summary", "Publish release"];
  names.forEach((name, i) => {
    const id = i + 1, checkId = id + 1000, status = name === "Publish release" ? "in_progress" : "completed";
    state.jobs.set(id, { id, name, run_id: 101, head_sha: f.source, head_branch: "develop", status, conclusion: status === "completed" ? "success" : null, completed_at: "2026-10-24T00:00:00Z", check_run_url: `https://api.github.com/repos/test/repository/check-runs/${checkId}` }); state.jobAttempts.set(id, 1);
    state.checks.set(checkId, { id: checkId, name, head_sha: f.source, check_suite: { id: 111 }, app: { id: 15368, slug: "github-actions" }, status, conclusion: status === "completed" ? "success" : null, completed_at: "2026-10-24T00:00:00Z" });
  });
  const proof = { schema_version: 1, repository_id: 123, repository: "test/repository", workflow_ref: `test/repository/${workflowPath}@refs/heads/develop`, workflow_sha: f.source, ref: "refs/heads/develop", head_sha: f.source, event: "push", run_id: 101, run_attempt: 1, check_set_version: "1" };
  state.artifacts = new Map();
  const artifact = (id, name, files) => {
    const bytes = encodeZip([...files].map(([path, bytes]) => ({ path, bytes, mode: "100644" })));
    state.artifacts.set(id, { id, name, size_in_bytes: bytes.length, digest: `sha256:${digest(bytes)}`, expired: false, workflow_run: { id: 101, repository_id: 123, head_repository_id: 123, head_branch: "develop", head_sha: f.source }, bytes });
    return { id, digest: digest(bytes), name, run_id: 101, head_sha: f.source };
  };
  const refArtifact = artifact(201, `push-ref-${f.source}-101-1`, new Map([["push-ref.json", json(proof)]])), bundleArtifact = artifact(202, `release-${f.source}-101-1`, built.bundle);
  state.approvals = [{ state: "approved", user: { id: 61 }, environments: [{ id: 51, name: "production" }] }];
  const execution = { run_id: 101, run_attempt: 1, workflow_sha: f.source, tool_sha: f.source, event: "push" };
  const original = { source_sha: f.source, run_id: 101, run_attempt: 1, ref_artifact_id: 201, ref_artifact_digest: refArtifact.digest, workflow_id: 10, actions_app_id: 15368, recipe_tool_sha: f.source };
  const review = { source_commit: f.source, source_tree: f.git("show", "-s", "--format=%T", f.source), tool_commit: f.source, tool_tree: f.git("show", "-s", "--format=%T", f.source), recipe_version: "1", archive_sha256: built.summary.archive_sha256, manifest_sha256: built.summary.manifest_sha256, scope: ["source", "production-transform", "workflow", "release-tool", "user-docs"], verdict: "pass", subject_type: "agent", subject_id: "synthetic-reviewer", reviewed_at: "2026-10-24T00:00:00Z", report_sha256: "e".repeat(64) };
  const installations = installPlatforms.map((platform, i) => artifact(211 + i, `installation-${f.source}-101-1-${platform}`, new Map([["installation.json", json(installationProof(f.api(), execution, bundleArtifact, built.summary, platform, 8 + i))]])));
  const input = { source_sha: f.source, base_sha: f.base, control_root: f.rootSha, original_ci: original, execution, artifact: bundleArtifact, installations, review };
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 }), privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  state.appCalls = []; state.issued = { token: "write-fixture-token", expires_at: "2026-10-24T13:00:00Z", permissions: { contents: "write", metadata: "read" }, repositories: [{ id: 123, full_name: "test/repository" }] };
  state.installation = { id: 81, app_id: 71, repository_selection: "selected", suspended_at: null, app_slug: "release-fixture", permissions: { contents: "write", metadata: "read" } };
  state.route = async ({ request, response, url, path, method, body, reply, paged }) => {
    const handled = value => { reply(value); return true; };
    if (path === "/installation" || url.pathname.startsWith("/app/installations/")) {
      state.appCalls.push({ method, path, body });
      const jwt = request.headers.authorization?.slice(7).split(".");
      if (!jwt || jwt.length !== 3 || !verify("RSA-SHA256", Buffer.from(jwt.slice(0,2).join(".")), keys.publicKey, Buffer.from(jwt[2], "base64url"))) { reply({}, 401); return true; }
      state.jwt = JSON.parse(Buffer.from(jwt[1], "base64url"));
      if (state.appFailure) { reply({}, state.appFailure); return true; }
      return handled(path === "/installation" ? state.installation : state.issued);
    }
    if (url.pathname.startsWith("/users/")) return handled({ id: 91, login: "release-fixture[bot]", type: "Bot" });
    if (url.pathname === "/installation/token") { state.appCalls.push({ method, path }); if (state.revokeFailure) reply({}, 503); else { response.writeHead(204); response.end(); } return true; }
    if (state.failPath === path) return false;
    const readRoutes = new Map([["/environments/production", state.environment], ["/actions/workflows/10", { id: 10, path: workflowPath, state: "active" }], ["/actions/runs/101/approvals", state.approvals]]);
    if (method === "GET") {
      if (readRoutes.has(path)) { state.calls.push({ method, path }); return handled(readRoutes.get(path)); }
      if (path === "/environments/production/deployment-branch-policies") { state.calls.push({ method, path }); paged(state.branches, part => ({ total_count: state.branches.length, branch_policies: part })); return true; }
      if (path.startsWith("/rulesets/")) { state.calls.push({ method, path }); return handled(state.rulesets.get(Number(path.split("/").at(-1)))); }
      if (/^\/actions\/runs\/\d+\/attempts\/\d+$/.test(path)) { state.calls.push({ method, path }); const [, run, attempt] = /runs\/(\d+)\/attempts\/(\d+)/.exec(path); const value = state.runs.get(`${run}/${attempt}`); reply(value ?? {}, value ? 200 : 404); return true; }
      if (path.startsWith("/check-runs/")) { state.calls.push({ method, path }); const check = state.checks.get(Number(path.split("/").at(-1))); reply(check ?? {}, check ? 200 : 404); return true; }
      if (path.startsWith("/actions/artifacts/")) {
        state.calls.push({ method, path }); const value = state.artifacts.get(Number(path.split("/")[3]));
        if (!value) { reply({}, 404); return true; }
        if (path.endsWith("/zip")) response.end(value.bytes); else { const { bytes, ...metadata } = value; reply(metadata); } return true;
      }
    }
    const rawObject = (type, bytes) => f.gitBytes(["hash-object", "-t", type, "-w", "--stdin"], Buffer.from(bytes)).toString().trim();
    const identity = who => `${who.name} <${who.email}> ${Date.parse(who.date) / 1000} +0000`;
    if (method === "POST" && path === "/git/commits" && body.author) {
      state.calls.push({ method, path, body });
      const sha = rawObject("commit", `tree ${body.tree}\n${body.parents.map(parent => `parent ${parent}\n`).join("")}author ${identity(body.author)}\ncommitter ${identity(body.committer)}\n\n${body.message}`); return handled({ sha });
    }
    if (method === "POST" && path === "/git/tags") {
      state.calls.push({ method, path, body }); const sha = rawObject("tag", `object ${body.object}\ntype ${body.type}\ntag ${body.tag}\ntagger ${identity(body.tagger)}\n\n${body.message}`); return handled({ sha });
    }
    if ((method === "POST" && ["/git/refs", "/releases"].includes(path)) || (method === "PATCH" && /^\/releases\/\d+$/.test(path))) {
      state.calls.push({ method, path, body }); state.business.push({ method, path, body, control: f.readState() });
      if (state.mode === "reject") { reply({}, 422); return true; }
      if (state.mode === "unknown") { response.destroy(); return true; }
      let value;
      if (path === "/git/refs") { f.git("update-ref", body.ref, body.sha, "0".repeat(40)); value = { ref: body.ref, object: { sha: body.sha, type: "tag" } }; }
      else if (path === "/releases") {
        if (f.ref(`refs/tags/${body.tag_name}^{}`) !== body.target_commitish) { reply({}, 422); return true; }
        value = { ...body, id: 301, immutable: false, upload_url: "https://uploads.github.com/repos/test/repository/releases/301/assets{?name,label}" }; state.releases.push(value);
      } else { value = state.releases.find(value => value.id === Number(path.split("/").at(-1))); Object.assign(value, { draft: false, prerelease: false, immutable: !state.notImmutable }); }
      if (state.mode === "success-lost") response.destroy(); else reply(value, 201); return true;
    }
    return false;
  };
  return Object.assign(f, { built, policy, execution, original, review, input, privateKey, proof, artifact });
}
