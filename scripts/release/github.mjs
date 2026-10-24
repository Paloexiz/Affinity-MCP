import { createHash } from "node:crypto";
import { packageDeclarations, parseVersion } from "../check-version.mjs";

export const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export const json = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
export const reject = message => { throw new Error(message); };
export function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) reject("Unexpected protocol fields.");
}
export function objectSha(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{40}$/.test(value) || /^0+$/.test(value)) reject("Expected a full nonzero Git SHA.");
  return value;
}
export function hash(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) reject("Expected a SHA-256 digest.");
  return value;
}
export function id(value) {
  if (!Number.isSafeInteger(value) || value < 1) reject("Expected a positive platform identifier.");
  return value;
}
export function utc(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().replace(".000Z", "Z") !== value) reject("Expected an exact UTC timestamp.");
  return value;
}
export const nowUTC = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

export class ApiError extends Error {
  constructor(status) { super(status ? `GitHub request failed (HTTP ${status}); state is not inferred.` : "GitHub response is unknown; no write retry was attempted."); this.status = status; }
}

export class GitHub {
  constructor({ repository, repositoryId, readToken, writeToken }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || repository.split("/").some(part => [".", ".."].includes(part))) reject("Invalid target repository.");
    this.repository = repository; this.repositoryId = id(repositoryId); this.path = `/repos/${repository}`;
    this.readToken = readToken; this.writeToken = writeToken;
  }
  async request(method, path, body, { raw = false, pagination = false, upload = false, artifact = false } = {}) {
    if (!path.startsWith(this.path + "/") && path !== this.path) reject("Request must remain in the configured repository.");
    if (upload && (method !== "POST" || raw || pagination || !Buffer.isBuffer(body) || !/^\/releases\/[1-9]\d*\/assets\?name=[\w.-]+$/.test(path.slice(this.path.length)))) reject("Invalid raw asset upload request.");
    if (artifact && (method !== "GET" || !raw || !/^\/actions\/artifacts\/[1-9]\d*\/zip$/.test(path.slice(this.path.length)))) reject("Invalid artifact download request.");
    const token = method === "GET" ? this.readToken : this.writeToken;
    if (!token) reject("Required scoped credential is unavailable.");
    let response;
    try {
      response = await fetch(`https://${upload ? "uploads" : "api"}.github.com${path}`, {
        method, redirect: "manual", signal: AbortSignal.timeout(30000),
        headers: { accept: raw ? "application/octet-stream" : "application/vnd.github+json", authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2026-03-10", ...(body === undefined ? {} : { "content-type": upload ? "application/octet-stream" : "application/json" }), ...(upload ? { "content-length": String(body.length) } : {}) },
        ...(body === undefined ? {} : { body: upload ? body : JSON.stringify(body) }),
      });
      if (raw && response.status === 302) {
        const url = new URL(response.headers.get("location"));
        if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname.endsWith(".githubusercontent.com") || (artifact && (url.hostname.endsWith(".blob.core.windows.net") || url.hostname.endsWith(".actions.githubusercontent.com"))))) reject("Unexpected asset download destination.");
        response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(30000) });
      }
      if (!response.ok) throw new ApiError(response.status);
      let data;
      if (raw) {
        const chunks = []; let size = 0;
        // shortcut: bound downloaded bundles at 256 MiB, switch to audited streaming before larger releases.
        for await (const chunk of response.body) { size += chunk.length; if (size > 256 * 1024 * 1024) reject("Download exceeds the supported size."); chunks.push(chunk); }
        data = Buffer.concat(chunks);
      } else data = await response.json();
      return pagination ? { data, link: response.headers.get("link") } : data;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(null); }
  }
  get(path, options) { return this.request("GET", this.path + path, undefined, options); }
  async identity({ writable = false } = {}) {
    const repo = await this.get("");
    if (repo.id !== this.repositoryId || repo.full_name?.toLowerCase() !== this.repository.toLowerCase() || (writable && repo.default_branch !== "main")) reject("Repository identity or default branch is not confirmed.");
    return repo;
  }
  async *pages(path) {
    const endpoint = new URL(this.path + path, "https://api.github.com");
    if (endpoint.searchParams.has("page") || endpoint.searchParams.has("per_page")) reject("Unexpected pagination parameters.");
    endpoint.searchParams.set("per_page", "100");
    // shortcut: cap enumerations at 1000 pages, revise before accepting a larger history.
    for (let page = 1; page <= 1000; page++) {
      endpoint.searchParams.set("page", String(page));
      const { data, link } = await this.request("GET", endpoint.pathname + endpoint.search, undefined, { pagination: true });
      let next = false;
      if (link !== null) for (const item of link.split(",")) {
        const match = /^\s*<([^<>\s]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(item);
        if (!match) reject("Malformed pagination link.");
        if (match[2] !== "next") continue;
        if (next) reject("Duplicate pagination next link.");
        let url; try { url = new URL(match[1]); } catch { reject("Invalid pagination URL."); }
        const expected = new URL(endpoint); expected.searchParams.set("page", String(page + 1));
        expected.searchParams.sort(); url.searchParams.sort();
        const canonicalPath = `/repositories/${this.repositoryId}` + endpoint.pathname.slice(this.path.length);
        if (url.origin !== endpoint.origin || url.username || url.password || url.hash || ![endpoint.pathname, canonicalPath].includes(url.pathname) || url.search !== expected.search) reject("Untrusted or nonconsecutive pagination link.");
        next = true;
      }
      yield data;
      if (!next) return;
    }
    reject("Collection exceeds the supported pagination limit.");
  }
  async list(path) {
    const all = [];
    for await (const part of this.pages(path)) {
      if (!Array.isArray(part)) reject("Incomplete collection response.");
      all.push(...part);
      if (all.length > 100000) reject("Collection exceeds the supported complete-enumeration limit.");
    }
    return all;
  }
  async jobs(run, attempt) {
    const path = `/actions/runs/${id(run)}/attempts/${id(attempt)}/jobs`, all = [], seen = new Set(); let total;
    // shortcut: cap an attempt at 100000 jobs, revise before accepting a larger workflow.
    for await (const result of this.pages(path)) {
      if (!result || !Number.isSafeInteger(result.total_count) || result.total_count < 0 || result.total_count > 100000 || !Array.isArray(result.jobs) || result.jobs.length > 100 || (total !== undefined && total !== result.total_count)) reject("Incomplete attempt jobs response.");
      total = result.total_count;
      for (const job of result.jobs) {
        if (job?.run_id !== run || seen.has(id(job.id))) reject("Duplicate or foreign attempt job.");
        seen.add(job.id); all.push(job);
      }
      if (all.length > total) reject("Incomplete attempt jobs response.");
    }
    if (all.length !== total) reject("Incomplete attempt jobs response.");
    return all;
  }
  async collection(path, key) {
    const all = [], seen = new Set(); let total;
    for await (const part of this.pages(path)) {
      if (!Number.isSafeInteger(part?.total_count) || part.total_count < 0 || part.total_count > 100000 || !Array.isArray(part[key]) || part[key].length > 100 || (total !== undefined && total !== part.total_count)) reject("Incomplete named collection.");
      total = part.total_count;
      for (const value of part[key]) { if (seen.has(id(value.id))) reject("Duplicate collection identity."); seen.add(value.id); all.push(value); }
      if (all.length > total) reject("Collection count differs.");
    }
    if (all.length !== total) reject("Collection count differs.");
    return all;
  }
  async ref(name) {
    if (!/^(?:heads\/(?:main|develop|release-control)|tags\/v\d+\.\d+\.\d+)$/.test(name)) reject("Unsupported reference.");
    const ref = await this.get(`/git/ref/${name}`);
    if (ref.ref !== `refs/${name}` || !["commit", "tag"].includes(ref.object?.type)) reject("Unexpected reference identity.");
    return objectSha(ref.object.sha);
  }
  async commit(sha) {
    const commit = await this.get(`/git/commits/${objectSha(sha)}`);
    if (commit.sha !== sha || !Array.isArray(commit.parents)) reject("Unexpected commit identity.");
    objectSha(commit.tree?.sha); commit.parents.forEach(parent => objectSha(parent.sha)); return commit;
  }
  async tree(sha, recursive = false) {
    const tree = await this.get(`/git/trees/${objectSha(sha)}${recursive ? "?recursive=1" : ""}`);
    if (tree.sha !== sha || tree.truncated !== false || !Array.isArray(tree.tree)) reject("Incomplete Git tree.");
    return tree.tree;
  }
  async blob(sha) {
    const blob = await this.get(`/git/blobs/${objectSha(sha)}`);
    if (blob.sha !== sha || blob.encoding !== "base64" || typeof blob.content !== "string") reject("Unexpected blob response.");
    const bytes = Buffer.from(blob.content, "base64");
    const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (actual !== sha || blob.size !== bytes.length) reject("Git blob bytes do not match their identity.");
    return bytes;
  }
  async version(sha) {
    const commit = await this.commit(sha), entries = await this.tree(commit.tree.sha, true);
    const paths = [".codex-plugin/plugin.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"];
    const files = new Map();
    for (const path of paths) {
      const entry = entries.find(entry => entry.path === path);
      if (!entry || entry.mode !== "100644" || entry.type !== "blob") reject("Candidate version sources are missing or unsupported.");
      files.set(path, new TextDecoder("utf-8", { fatal: true }).decode(await this.blob(entry.sha)));
    }
    const values = packageDeclarations(path => files.get(path) ?? reject("Missing version declaration."));
    const version = values[0][1]; parseVersion(version, "stable");
    if (values.some(([, value]) => value !== version)) reject("Version declarations differ.");
    return version;
  }
}
