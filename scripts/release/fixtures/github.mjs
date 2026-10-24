import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { genesis } from "../control.mjs";
import { json, GitHub } from "../github.mjs";

const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));
export async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "ai-agent-control-"));
  const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
  const gitBytes = (args, input) => execFileSync("git", ["--no-replace-objects", ...args], { cwd: root, input, stdio: "pipe", env: { ...cleanEnvironment, GIT_AUTHOR_NAME: "Release fixture", GIT_AUTHOR_EMAIL: "fixture@example.com", GIT_COMMITTER_NAME: "Release fixture", GIT_COMMITTER_EMAIL: "fixture@example.com", GIT_AUTHOR_DATE: "2026-10-24T00:00:00Z", GIT_COMMITTER_DATE: "2026-10-24T00:00:00Z" } });
  const git = (...args) => gitBytes(args).toString().trim();
  git("init", "--bare", "--object-format=sha1");
  const blob = bytes => gitBytes(["hash-object", "-w", "--stdin", "--no-filters"], bytes).toString().trim();
  const tree = files => {
    const folders = new Map(), direct = [];
    for (const entry of files) {
      const [first, ...parts] = entry.path.split("/");
      if (!parts.length) direct.push(`${entry.mode} ${entry.type} ${entry.sha}\t${first}\0`);
      else { if (!folders.has(first)) folders.set(first, []); folders.get(first).push({ ...entry, path: parts.join("/") }); }
    }
    for (const [path, entries] of folders) direct.push(`040000 tree ${tree(entries)}\t${path}\0`);
    return gitBytes(["mktree", "-z"], direct.join("")).toString().trim();
  };
  const commit = (treeSha, parents, message = "Fixture commit") => gitBytes(["commit-tree", treeSha, ...parents.flatMap(sha => ["-p", sha])], message + "\n").toString().trim();
  const dataCommit = (state, parents = []) => commit(tree([{ path: "control.json", mode: "100644", type: "blob", sha: blob(json(state)) }]), parents);
  const version = JSON.parse(readFileSync(join(sourceRoot, ".codex-plugin/plugin.json"))).version;
  const versionTree = target => tree([".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"].map(path => ({ path, mode: "100644", type: "blob", sha: blob(Buffer.from(readFileSync(join(sourceRoot, path), "utf8").replaceAll(version, target))) })));
  const base = commit(versionTree("0.5.3"), []), source = commit(versionTree("0.5.4"), [base]);
  const rootSha = dataCommit(genesis(123, "a".repeat(40)));
  for (const [branch, sha] of [["main", base], ["develop", source], ["release-control", rootSha]]) git("update-ref", `refs/heads/${branch}`, sha);
  const state = { defaultBranch: "main", repositoryId: 123, jobs: new Map(), jobAttempts: new Map(), releases: [], assets: new Map(), calls: [], destinations: [], business: [], mode: "success", blocked: null, barriers: [], barrierCount: 0, failPath: null };
  const ref = name => git("rev-parse", name);
  const readState = () => JSON.parse(gitBytes(["show", `${ref("refs/heads/release-control")}:control.json`]));
  const parentList = sha => git("show", "-s", "--format=%P", sha).split(" ").filter(Boolean);
  const server = createServer(async (request, response) => {
    let body; const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const reply = (value, code = 200, headers = {}) => { response.writeHead(code, { "content-type": "application/json", ...headers }); response.end(JSON.stringify(value)); };
    try {
      body = request.headers["content-type"] === "application/octet-stream" ? Buffer.concat(chunks) : chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
      const url = new URL(request.url, "http://localhost"), path = url.pathname.replace(/^\/repos\/test\/repository/, ""), method = request.method;
      const paged = (items, shape = part => part) => {
        const page = Number(url.searchParams.get("page") ?? 1), size = state.pageSize ?? 100;
        const next = new URL(request.url, "https://api.github.com"); next.searchParams.set("page", String(page + 1));
        if (state.canonicalLinks) next.pathname = next.pathname.replace("/repos/test/repository", "/repositories/123");
        const link = state.paginationLink ?? (items.length > page * size ? `<${next.href}>; rel="next"` : null);
        reply(shape(items.slice((page - 1) * size, page * size), page), 200, link ? { link } : {});
      };
      if (state.route && await state.route({ request, response, url, path, method, body, reply, paged })) return;
      if (!url.pathname.startsWith("/repos/test/repository") || request.headers.authorization !== `Bearer ${method === "GET" ? "read-fixture-token" : "write-fixture-token"}`) return reply({ message: "Denied fixture credential" }, 403);
      state.calls.push({ method, path, query: url.search, body });
      if (state.failPath === path) return reply({ message: "Secret should not appear in client errors: write-fixture-token" }, 403);
      if (method === "GET") {
        if (path === "") return reply({ id: state.repositoryId, full_name: "test/repository", default_branch: state.defaultBranch });
        if (path.startsWith("/git/ref/")) { const name = "refs/" + path.slice(9); return reply({ ref: name, object: { sha: ref(name), type: git("cat-file", "-t", ref(name)) } }); }
        if (path.startsWith("/git/matching-refs/")) {
          const prefix = "refs/" + path.slice(19);
          const refs = git("for-each-ref", "--format=%(refname) %(objectname) %(objecttype)").split("\n").filter(line => line.startsWith(prefix)).map(line => { const [ref, sha, type] = line.split(" "); return { ref, object: { sha, type } }; });
          return paged(refs);
        }
        if (path.startsWith("/git/commits/")) {
          const sha = path.slice(13), who = field => { const [name, email, date] = git("show", "-s", `--format=%${field}n%n%${field}e%n%${field}I`, sha).split("\n"); return { name, email, date: new Date(date).toISOString().replace(".000Z", "Z") }; };
          return reply({ sha, tree: { sha: git("show", "-s", "--format=%T", sha) }, parents: parentList(sha).map(sha => ({ sha })), message: git("show", "-s", "--format=%B", sha), author: who("a"), committer: who("c") });
        }
        if (path.startsWith("/git/tags/")) {
          const sha = path.slice(10), text = git("cat-file", "tag", sha); const [, object, type, tag] = /^object (\w+)\ntype (\w+)\ntag ([^\n]+)\n/.exec(text);
          const identity = /^tagger (.+) <([^>]+)> (\d+) \+0000$/m.exec(text), tagger = identity && { name: identity[1], email: identity[2], date: new Date(Number(identity[3]) * 1000).toISOString().replace(".000Z", "Z") };
          return reply({ sha, tag, object: { sha: object, type }, ...(tagger ? { tagger } : {}), message: text.slice(text.indexOf("\n\n") + 2) });
        }
        if (path.startsWith("/git/trees/")) {
          const sha = path.slice(11), recursive = url.searchParams.has("recursive") ? ["-r"] : [];
          const entries = gitBytes(["ls-tree", "-z", ...recursive, sha]).toString().split("\0").filter(Boolean).map(line => { const [, mode, type, sha, path] = /^(\d+) (\w+) (\w+)\t(.*)$/.exec(line); return { mode, type, sha, path }; });
          return reply({ sha, truncated: false, tree: entries });
        }
        if (path.startsWith("/git/blobs/")) { const sha = path.slice(11), bytes = gitBytes(["cat-file", "blob", sha]); return reply({ sha, encoding: "base64", size: bytes.length, content: bytes.toString("base64") }); }
        if (path.startsWith("/actions/jobs/")) { const job = state.jobs.get(Number(path.slice(14))); return reply(job ?? {}, job ? 200 : 404); }
        if (/^\/actions\/runs\/\d+\/attempts\/\d+\/jobs$/.test(path)) {
          const [, run, attempt] = /^\/actions\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/.exec(path);
          const jobs = [...state.jobs.values()].filter(job => job.run_id === Number(run) && state.jobAttempts.get(job.id) === Number(attempt));
          return paged(jobs, (part, page) => { const result = { total_count: jobs.length, jobs: part }; return state.jobsResponse ? state.jobsResponse(result, page) : result; });
        }
        if (path === "/releases") return paged(state.releases);
        if (path === "/releases/latest") return reply(state.releases.find(release => !release.draft) ?? {}, state.releases.some(release => !release.draft) ? 200 : 404);
        if (/^\/releases\/\d+$/.test(path)) { const release = state.releases.find(item => item.id === Number(path.split("/").at(-1))); return reply(release ?? {}, release ? 200 : 404); }
        if (/^\/releases\/\d+\/assets$/.test(path)) return paged([...state.assets.values()].map(({ bytes, ...asset }) => asset));
        if (/^\/releases\/assets\/\d+$/.test(path)) { const asset = state.assets.get(Number(path.split("/").at(-1))); if (!asset) return reply({}, 404); response.end(asset.bytes); return; }
      }
      if (method === "POST" && /^\/releases\/\d+\/assets$/.test(path)) {
        const name = url.searchParams.get("name"), control = readState(); state.business.push({ body, control, path, name });
        if (!Buffer.isBuffer(body) || request.headers["content-length"] !== String(body.length)) return reply({}, 400);
        if (state.mode === "reject" || [...state.assets.values()].some(asset => asset.name === name)) return reply({}, 422);
        if (state.mode === "unknown") { response.destroy(); return; }
        const asset = { id: state.assets.size + 1, name, size: body.length, state: "uploaded", bytes: body }; state.assets.set(asset.id, asset);
        if (state.mode === "success-lost") { response.destroy(); return; }
        return reply({ ...asset, bytes: undefined }, 201);
      }
      if (method === "POST" && path === "/git/blobs") {
        const bytes = Buffer.from(body.content, body.encoding === "base64" ? "base64" : "utf8");
        if (state.rejectControlBlob?.(JSON.parse(bytes))) return reply({}, 403);
        return reply({ sha: blob(bytes) }, 201);
      }
      if (method === "POST" && path === "/git/trees") return reply({ sha: tree(body.tree) }, 201);
      if (method === "POST" && path === "/git/commits") return reply({ sha: commit(body.tree, body.parents, body.message) }, 201);
      if (method === "PATCH" && path === "/git/refs/heads/release-control") {
        if (state.barrierCount) { await new Promise(resolve => { state.barriers.push(resolve); if (state.barriers.length === state.barrierCount) { state.barrierCount = 0; state.barriers.splice(0).forEach(fn => fn()); } }); }
        const before = ref("refs/heads/release-control");
        if (body.force !== false || JSON.stringify(parentList(body.sha)) !== JSON.stringify([before])) return reply({ message: "Non fast-forward" }, 422);
        git("update-ref", "refs/heads/release-control", body.sha, before); return reply({ ref: "refs/heads/release-control", object: { sha: body.sha, type: "commit" } });
      }
      if (method === "PATCH" && path === "/git/refs/heads/main") {
        const control = readState(); state.business.push({ body, control }); state.onBusiness?.();
        if (state.mode === "pending") { state.blocked = body; return; }
        if (state.mode === "reject") return reply({}, 422);
        if (state.mode === "unknown") { state.blocked = body; response.destroy(); return; }
        const before = ref("refs/heads/main");
        if (body.force !== false || git("merge-base", before, body.sha) !== before) return reply({}, 422);
        git("update-ref", "refs/heads/main", body.sha, before);
        if (state.mode === "success-lost") { response.destroy(); return; }
        return reply({ ref: "refs/heads/main", object: { sha: body.sha, type: "commit" } });
      }
      return reply({ message: "Fixture route absent" }, 404);
    } catch { if (!response.headersSent) reply({ message: "Fixture object absent or request invalid" }, 404); else response.destroy(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => { const target = new URL(input); state.destinations.push(target.href); return originalFetch(url + target.pathname + target.search, options); };
  const preload = join(root, "preload.mjs");
  writeFileSync(preload, `const originalFetch=globalThis.fetch;globalThis.fetch=(input,options)=>{const target=new URL(input);return originalFetch(${JSON.stringify(url)}+target.pathname+target.search,options)};if(process.env.FIXTURE_NOW){const OriginalDate=Date;const instant=OriginalDate.parse(process.env.FIXTURE_NOW);globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[instant]))}static now(){return instant}}}\n`);
  t.after(async () => { globalThis.fetch = originalFetch; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const api = () => new GitHub({ repository: "test/repository", repositoryId: 123, readToken: "read-fixture-token", writeToken: "write-fixture-token" });
  const actor = (job = 1, operation = "publish", expiry = Date.now() + 600000) => {
    state.jobs.set(job, { id: job, run_id: job + 100, status: "in_progress" }); state.jobAttempts.set(job, 1);
    return { run_id: job + 100, job_id: job, run_attempt: 1, operation, source_sha: source, version: "0.5.4", workflow_sha: "b".repeat(40), tool_sha: "a".repeat(40), token_expires_at: new Date(expiry).toISOString().replace(/\.\d{3}Z$/, "Z") };
  };
  return { root, rootSha, source, base, git, gitBytes, blob, tree, commit, dataCommit, versionTree, ref, readState, state, url, api, actor, preload };
}

export async function atTime(time, work) {
  const OriginalDate = globalThis.Date, instant = OriginalDate.parse(time);
  globalThis.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
  try { return await work(); } finally { globalThis.Date = OriginalDate; }
}
