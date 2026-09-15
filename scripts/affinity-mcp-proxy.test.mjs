import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = name => JSON.parse(readFileSync(join(root, name), "utf8"));
const codex = readJson(".codex-plugin/plugin.json");
const claude = readJson(".claude-plugin/plugin.json");
const claudeMarket = readJson(".claude-plugin/marketplace.json");
const codexMarket = readJson(".agents/plugins/marketplace.json");
assert.equal(claudeMarket.plugins.length, 1);
assert.equal(claudeMarket.plugins[0].source, "./");
assert.equal(claudeMarket.plugins[0].name, codex.name);
assert.equal(claude.name, codex.name);
assert.equal(claude.version, codex.version);
assert.equal(claudeMarket.plugins[0].version, codex.version);
// ZCode uses this same index and requires an HTTPS icon URL.
assert.equal(new URL(claudeMarket.plugins[0].icon).protocol, "https:");
assert.ok(claudeMarket.plugins[0].description_i18n["zh-CN"]);
assert.equal(codexMarket.plugins.length, 1);
assert.equal(codexMarket.plugins[0].source.path, "./");
const codexLaunch = codex.mcpServers["affinity-by-canva"];
const sharedLaunch = readJson(".mcp.json").mcpServers["affinity-by-canva"];
// Exercise installed paths containing spaces and Unicode, outside the caller's cwd.
const scratch = mkdtempSync(join(tmpdir(), "ai-agent-affinity plugin-中文-"));
mkdirSync(join(scratch, "scripts"));
copyFileSync(join(root, "scripts/affinity-mcp-proxy.mjs"), join(scratch, "scripts/affinity-mcp-proxy.mjs"));

// Exercise the real process boundary; no Affinity documents are touched.
const streams = new Map();
const calls = [];
let session = 0;
const server = createServer(async (req, res) => {
  if (req.url === "/sse") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    streams.set(++session, res);
    res.write(`event: endpoint\r\ndata: /message?session=${session}\r\n\r\n`);
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const msg = JSON.parse(body);
  calls.push(msg);
  const stream = streams.get(Number(new URL(req.url, "http://localhost").searchParams.get("session")));
  if (msg.params?.name === "post_failure") {
    res.writeHead(503).end("unavailable");
    return;
  }
  res.writeHead(202).end();
  if (msg.id == null) return;
  if (msg.params?.name === "disconnect") {
    stream.end();
    return;
  }
  let result = {};
  if (msg.method === "initialize") result = { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "mock", version: "1" } };
  if (msg.method === "tools/list") result = msg.params?.cursor
    ? { tools: [{ name: "second", inputSchema: { type: "object" } }] }
    : { tools: [{ name: "execute_script", inputSchema: { type: "object" } }], nextCursor: "page2" };
  if (msg.method === "tools/call") result = { content: [{ type: "text", text: "中文 SDK result" }, { type: "image", mimeType: "image/jpeg", data: "dGVzdA==" }], isError: false };
  // Default SSE event and multiline data are both valid.
  stream.write(`data: {"jsonrpc":"2.0","id":${msg.id},\r\ndata: "result":${JSON.stringify(result)}}\r\n\r\n`);
});
server.listen(0, "127.0.0.1");
await once(server, "listening");

async function check(framed, launch, label = "direct") {
  const child = spawn(launch?.command ?? process.execPath,
    launch ? launch.args.map(arg => arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", scratch)) : [fileURLToPath(new URL("./affinity-mcp-proxy.mjs", import.meta.url))], {
    cwd: launch?.cwd ? resolve(scratch, launch.cwd) : tmpdir(),
    env: { ...process.env, ...launch?.env, AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}` },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = Buffer.alloc(0);
  let stderr = "";
  let id = 0;
  const pending = new Map();
  child.stderr.on("data", c => stderr += c);
  child.stdout.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      let start = 0, end;
      if (framed) {
        const separator = buffer.indexOf("\r\n\r\n");
        if (separator < 0) return;
        start = separator + 4;
        end = start + Number(buffer.subarray(0, separator).toString().match(/Content-Length: (\d+)/i)[1]);
        if (buffer.length < end) return;
      } else {
        end = buffer.indexOf("\n");
        if (end < 0) return;
      }
      const msg = JSON.parse(buffer.subarray(start, end).toString());
      buffer = buffer.subarray(end + (framed ? 0 : 1));
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  async function rpc(method, params = {}) {
    const key = ++id;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} ${framed ? "framed" : "newline"} ${method} id=${key}: no response; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`)), 2500);
      pending.set(key, msg => { clearTimeout(timer); resolve(msg); });
    });
    const body = JSON.stringify({ jsonrpc: "2.0", id: key, method, params });
    const wire = Buffer.from(framed ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : `${body}\n`);
    child.stdin.write(wire.subarray(0, 5));
    child.stdin.write(wire.subarray(5));
    return response;
  }
  try {
    const info = (await rpc("initialize")).result.serverInfo;
    assert.equal(info.name, codex.name);
    assert.equal(info.version, codex.version);
    const first = (await rpc("tools/list")).result;
    assert.equal(first.nextCursor, "page2");
    assert.equal((await rpc("tools/list", { cursor: first.nextCursor })).result.tools[0].name, "second");
    const result = (await rpc("tools/call", { name: "execute_script", arguments: { script: "console.log('中文')" } })).result;
    assert.equal(result.content[0].text, "中文 SDK result");
    assert.equal(result.content[1].data, "dGVzdA==");
    assert.match((await rpc("tools/call", { name: "post_failure" })).error.message, /503/);
    const before = calls.filter(c => c.params?.name === "disconnect").length;
    assert.match((await rpc("tools/call", { name: "disconnect" })).error.message, /closed/i);
    assert.equal(calls.filter(c => c.params?.name === "disconnect").length, before + 1, "Never replay a tool after an ambiguous disconnect");
    assert.ok((await rpc("tools/list")).result.tools.length, "Next request reconnects");
    const closed = once(child, "close");
    child.stdin.end();
    await Promise.race([closed, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} ${framed ? "framed" : "newline"}: Proxy did not exit on stdin EOF; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`)), 2500);
      timer.unref();
    })]);
    assert.equal(child.exitCode, 0, `${label} ${framed ? "framed" : "newline"}; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`);
    console.log(`PASS ${label} ${framed ? "legacy Content-Length" : "MCP newline"}: discovery, SDK call, image, POST failure, disconnect, reconnect, EOF`);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

try {
  await check(false);
  await check(true);
  await check(false, codexLaunch, "Codex manifest");
  await check(false, sharedLaunch, "Claude Code / ZCode shared config");
} finally {
  for (const stream of streams.values()) stream.end();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  rmSync(scratch, { recursive: true, force: true });
}
