import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { buildProduction, verify, sha256 } from "./production.mjs";
import { decodeZip, pathOrder } from "./archive.mjs";

const smokePath = "skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs";
const proxyPath = "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs";
const configPaths = [".codex-plugin/plugin.json", ".mcp.json"];
const preamble = "JavaScript SDK for the Affinity by Canva application. require('/document.js'); console.log()";

function materialize(root, files) {
  mkdirSync(root);
  for (const { path, bytes } of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes, { flag: "wx" });
  }
}

function unchanged(root, files) {
  const paths = [];
  const walk = (path = "") => {
    for (const entry of readdirSync(join(root, path), { withFileTypes: true })) {
      const relative = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(relative);
      else { assert.ok(entry.isFile(), "Installation contains a non-file"); paths.push(relative); }
    }
  };
  walk();
  assert.deepEqual(paths.sort(pathOrder), files.map(file => file.path).sort(pathOrder), "Installation path set changed");
  for (const { path, bytes } of files) assert.deepEqual(readFileSync(join(root, path)), bytes, `Installation changed ${path}`);
}

export async function verifyInstall(root, options) {
  const summary = verify(root, options);
  const built = buildProduction(root, { source: options.source, base: options.base });
  const zip = readFileSync(join(options.bundle, summary.archive_name));
  const zipFiles = decodeZip(zip);
  const scratch = mkdtempSync(join(tmpdir(), "ai-agent-install-"));
  const streams = new Map(), requests = []; let nextSession = 0, fixtureFailure;
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/sse") {
        const id = ++nextSession; streams.set(id, res);
        res.on("close", () => streams.delete(id));
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`event: endpoint\ndata: /message?session=${id}\n\n`); return;
      }
      assert.equal(req.method, "POST");
      const url = new URL(req.url, "http://localhost"); assert.equal(url.pathname, "/message");
      const stream = streams.get(Number(url.searchParams.get("session"))); assert.ok(stream);
      let body = "";
      for await (const chunk of req) { body += chunk; assert.ok(body.length < 1024 * 1024); }
      const message = JSON.parse(body); requests.push(message);
      let result;
      if (message.method === "initialize") result = { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "archive-mock", version: "1" } };
      else if (message.method === "notifications/initialized") { res.writeHead(202).end(); return; }
      else if (message.method === "tools/list") {
        if (message.params?.cursor === undefined) result = { tools: [{ name: "execute_script", inputSchema: { type: "object" } }], nextCursor: "page2" };
        else { assert.equal(message.params.cursor, "page2"); result = { tools: [{ name: "second", inputSchema: { type: "object" } }, { name: "read_sdk_documentation_topic", inputSchema: { type: "object" } }] }; }
      } else {
        assert.equal(message.method, "tools/call");
        assert.deepEqual(message.params, { name: "read_sdk_documentation_topic", arguments: { filename: "preamble" } });
        result = { content: [{ type: "text", text: preamble }] };
      }
      res.writeHead(202).end(); stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n\n`);
    } catch (error) { fixtureFailure = error; res.writeHead(400).end(); }
  });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    assert.notEqual(server.address().port, 6767, "Mock must not use the real application port");
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const runner = join(scratch, "runner"); mkdirSync(runner);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ["path", "systemroot", "windir", "comspec", "temp", "tmp", "tmpdir", "lang", "lc_all", "tz"].includes(key.toLowerCase())));
    for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
    env.PATH = dirname(process.execPath) + delimiter + (process.env.PATH ?? process.env.Path ?? "");
    env.HOME = runner; env.USERPROFILE = runner;
    const installations = [];
    for (const [origin, files] of [["zip", zipFiles], ["production-tree", built.files]]) {
      const original = join(scratch, origin), copy = join(scratch, `${origin} 安装 副本 $`);
      materialize(original, files); cpSync(original, copy, { recursive: true, errorOnExist: true, force: false });
      const adjusted = files.map(file => ({ ...file }));
      for (const path of configPaths) {
        const file = adjusted.find(entry => entry.path === path), before = JSON.parse(file.bytes);
        const pattern = /("AFFINITY_MCP_BASE_URL"\s*:\s*)"(?:[^"\\]|\\.)*"/g;
        assert.equal([...file.bytes.toString("utf8").matchAll(pattern)].length, 1, "Mock endpoint must be unambiguous");
        const changed = file.bytes.toString("utf8").replace(pattern, (_, prefix) => prefix + JSON.stringify(endpoint));
        const after = JSON.parse(changed);
        after.mcpServers["affinity-by-canva"].env.AFFINITY_MCP_BASE_URL = before.mcpServers["affinity-by-canva"].env.AFFINITY_MCP_BASE_URL;
        assert.deepEqual(after, before, "Mock may change only the endpoint");
        file.bytes = Buffer.from(changed); writeFileSync(join(copy, path), file.bytes);
      }
      unchanged(copy, adjusted);
      for (const configuration of ["codex", "shared"]) {
        const start = requests.length;
        const entry = join(copy, smokePath);
        const { stdout, stderr } = await promisify(execFile)(process.execPath, [entry, "--plugin-root", copy, "--config", configuration], { cwd: runner, env, windowsHide: true, timeout: 70000, maxBuffer: 1024 * 1024 });
        assert.equal(stderr, ""); if (fixtureFailure) throw fixtureFailure;
        const result = JSON.parse(stdout);
        assert.equal(result.status, "PASS"); assert.equal(result.pluginRoot, realpathSync(copy)); assert.equal(result.configuration, configuration);
        assert.equal(result.pluginVersion, summary.version); assert.equal(result.nodeVersion, process.version);
        assert.equal(result.proxySha256, sha256(files.find(file => file.path === proxyPath).bytes));
        assert.equal(result.tools, 3); assert.equal(result.fallback, false);
        assert.equal(result.applicationBuild, null); assert.equal(result.applicationPlatform, null);
        assert.deepEqual(requests.slice(start).map(message => message.method), ["initialize", "notifications/initialized", "tools/list", "tools/list", "tools/call"]);
        unchanged(copy, adjusted); unchanged(original, files);
        installations.push({ origin, ...result, entry: realpathSync(entry), runner_cwd: realpathSync(runner), modifiedFiles: configPaths, onlyEndpointOverridden: true, requestCount: requests.length - start });
      }
    }
    verify(root, options);
    return { status: "PASS", scope: "local mock; no real Affinity or marketplace validation", production_tree_sha: summary.production_tree_sha, archive_sha256: summary.archive_sha256, installations };
  } finally {
    for (const stream of streams.values()) stream.end();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    rmSync(scratch, { recursive: true, force: true });
  }
}
