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
const scratch = mkdtempSync(join(tmpdir(), "affinity plugin-中文-"));
mkdirSync(join(scratch, "scripts"));
copyFileSync(join(root, "scripts/affinity-mcp-proxy.mjs"), join(scratch, "scripts/affinity-mcp-proxy.mjs"));

// Exercise the real process boundary; no Affinity documents are touched.
const streams = new Map();
const calls = [];
let session = 0;
let upstreamMode = "normal";
const server = createServer(async (req, res) => {
  if (req.url === "/sse") {
    if (upstreamMode === "connect_http") {
      res.writeHead(503).end("offline");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    streams.set(++session, res);
    if (upstreamMode === "endpoint_missing") {
      res.flushHeaders();
      return;
    }
    if (["endpoint_invalid", "endpoint_cross_origin"].includes(upstreamMode)) {
      const endpoint = upstreamMode === "endpoint_invalid" ? "http://[" : "https://example.invalid/message";
      res.write(`event: endpoint\ndata: ${endpoint}\n\n`);
      return;
    }
    res.write(`event: endpoint\r\ndata: /message?session=${session}\r\n\r\n`);
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const msg = JSON.parse(body);
  calls.push(msg);
  const stream = streams.get(Number(new URL(req.url, "http://localhost").searchParams.get("session")));
  if (msg.method === "initialize" && upstreamMode === "initialize_stall") {
    res.writeHead(202).end();
    return;
  }
  if (msg.method === "notifications/initialized" && upstreamMode === "notify_stall") {
    setTimeout(() => res.writeHead(202).end(), 900);
    return;
  }
  if (msg.method === "notifications/initialized" && upstreamMode === "notify_disconnect") {
    upstreamMode = "normal";
    stream.end();
    setTimeout(() => res.writeHead(202).end(), 150);
    return;
  }
  if (msg.params?.name === "post_failure") {
    res.writeHead(503).end("unavailable");
    return;
  }
  if (["delay_post", "sse_before_post", "sse_error_before_post"].includes(msg.params?.name)) {
    if (msg.params.name.startsWith("sse_")) {
      const response = msg.params.name === "sse_before_post"
        ? { result: { content: [{ type: "text", text: "early result" }] } }
        : { error: { code: -32001, message: "early upstream refusal" } };
      stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...response })}\n\n`);
    }
    setTimeout(() => res.writeHead(503).end("late POST failure"), 900);
    return;
  }
  res.writeHead(202).end();
  if (msg.id == null) return;
  if (["delay_response", "late_error"].includes(msg.params?.name)) {
    const response = msg.params.name === "late_error"
      ? { error: { code: -32002, message: "late upstream refusal" } }
      : { result: { content: [{ type: "text", text: "late result" }] } };
    setTimeout(() => stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...response })}\n\n`), 900);
    return;
  }
  if (msg.params?.name === "bad_sse") {
    stream.write("data: {invalid json\n\n");
    return;
  }
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

async function check(framed, launch, label = "direct", timeout, diagnostics = false) {
  const env = { ...process.env, ...launch?.env, AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}`, AFFINITY_MCP_PROTOCOL_VERSION: "2025-03-26" };
  delete env.AFFINITY_MCP_REQUEST_TIMEOUT_MS;
  if (timeout !== undefined) env.AFFINITY_MCP_REQUEST_TIMEOUT_MS = timeout;
  const child = spawn(launch?.command ?? process.execPath,
    launch ? launch.args.map(arg => arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", scratch)) : [fileURLToPath(new URL("./affinity-mcp-proxy.mjs", import.meta.url))], {
    cwd: launch?.cwd ? resolve(scratch, launch.cwd) : tmpdir(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = Buffer.alloc(0);
  let stderr = "";
  let id = 0;
  const pending = new Map();
  const responses = new Map();
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
      responses.set(msg.id, (responses.get(msg.id) || 0) + 1);
      buffer = buffer.subarray(end + (framed ? 0 : 1));
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  async function rpc(method, params = {}, waitMs = 2500) {
    const key = ++id;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} ${framed ? "framed" : "newline"} ${method} id=${key}: no response; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`)), waitMs);
      pending.set(key, msg => { clearTimeout(timer); resolve(msg); });
    });
    const body = JSON.stringify({ jsonrpc: "2.0", id: key, method, params });
    const wire = Buffer.from(framed ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : `${body}\n`);
    child.stdin.write(wire.subarray(0, 5));
    child.stdin.write(wire.subarray(5));
    return response;
  }
  try {
    const initialization = { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test-client", version: "1" } };
    const connectionsBeforeInitialize = session;
    const initialized = (await rpc("initialize", initialization)).result;
    assert.equal(initialized.protocolVersion, "2025-11-25");
    const info = initialized.serverInfo;
    assert.equal(info.name, codex.name);
    assert.equal(info.version, codex.version);
    for (const protocolVersion of ["bogus", "2099-01-01", ""]) {
      assert.equal((await rpc("initialize", { ...initialization, protocolVersion })).result.protocolVersion, "2025-11-25");
    }
    for (const protocolVersion of [undefined, null, 1, false, {}, []]) {
      assert.equal((await rpc("initialize", { ...initialization, protocolVersion })).error.code, -32602);
    }
    assert.equal((await rpc("initialize", null)).error.code, -32602);
    assert.equal(session, connectionsBeforeInitialize, "Client initialization never connects to Affinity");
    upstreamMode = "connect_http";
    assert.ok((await rpc("tools/list")).result.tools.some(tool => tool.name === "execute_script"), "Offline discovery retains fallback tools");
    upstreamMode = "normal";
    const callsBeforeDiscovery = calls.length;
    const first = (await rpc("tools/list")).result;
    assert.equal(calls.slice(callsBeforeDiscovery).find(call => call.method === "initialize").params.protocolVersion, env.AFFINITY_MCP_PROTOCOL_VERSION, "Affinity negotiation uses its independent configured version");
    assert.equal(first.nextCursor, "page2");
    assert.equal((await rpc("tools/list", { cursor: first.nextCursor })).result.tools[0].name, "second");
    const result = (await rpc("tools/call", { name: "execute_script", arguments: { script: "console.log('中文')" } })).result;
    assert.equal(result.content[0].text, "中文 SDK result");
    assert.equal(result.content[1].data, "dGVzdA==");
    if (diagnostics) {
      const post = (await rpc("tools/call", { name: "post_failure" })).error;
      assert.equal(post.data.phase, "post");
      assert.equal(post.data.outcome, "unknown");
      assert.doesNotMatch(post.message, /Ensure Affinity is running/);
      for (const [name, phase] of [["delay_response", "response"], ["delay_post", "post"], ["late_error", "response"]]) {
        const before = calls.filter(c => c.params?.name === name).length;
        const failure = (await rpc("tools/call", { name })).error;
        assert.equal(failure.data.phase, phase);
        assert.equal(failure.data.outcome, "unknown");
        assert.match(failure.message, /Inspect.*before retrying/i);
        assert.equal(calls.filter(c => c.params?.name === name).length, before + 1);
      }
      for (const name of ["sse_before_post", "sse_error_before_post"]) {
        const start = performance.now();
        const response = await rpc("tools/call", { name });
        assert.ok(performance.now() - start < 650, "SSE settlement must not wait for a stalled POST");
        if (name === "sse_before_post") assert.equal(response.result.content[0].text, "early result");
        else {
          assert.equal(response.error.data.phase, "upstream");
          assert.match(response.error.message, /early upstream refusal/);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1100));
      assert.ok([...responses.values()].every(n => n === 1), "Late results/errors never produce a second response");
      assert.doesNotMatch(stderr, /unhandled/i);
      const malformed = (await rpc("tools/call", { name: "bad_sse" })).error;
      assert.equal(malformed.data.phase, "sse");
      assert.equal(malformed.data.outcome, "unknown");
      assert.ok((await rpc("tools/list")).result.tools.length);
    }
    assert.match((await rpc("tools/call", { name: "post_failure" })).error.message, /503/);
    const before = calls.filter(c => c.params?.name === "disconnect").length;
    assert.match((await rpc("tools/call", { name: "disconnect" })).error.message, /closed/i);
    assert.equal(calls.filter(c => c.params?.name === "disconnect").length, before + 1, "Never replay a tool after an ambiguous disconnect");
    if (diagnostics) {
      for (const [mode, phase] of [["connect_http", "connect"], ["endpoint_missing", "endpoint"], ["endpoint_invalid", "endpoint"], ["endpoint_cross_origin", "endpoint"], ["initialize_stall", "response"], ["notify_stall", "post"]]) {
        upstreamMode = mode;
        const submitted = calls.filter(c => c.method === "tools/call").length;
        const failure = (await rpc("tools/call", { name: "never_submitted" }, 7000)).error;
        assert.equal(failure.data.phase, phase, mode);
        assert.equal(failure.data.outcome, "not_submitted", mode);
        assert.equal(calls.filter(c => c.method === "tools/call").length, submitted, mode);
      }
      upstreamMode = "notify_disconnect";
      const connectionsBefore = session;
      const toolsBefore = calls.filter(c => c.method === "tools/call").length;
      const failed = await Promise.all([
        rpc("tools/call", { name: "never_submitted" }),
        rpc("tools/call", { name: "never_submitted" }),
      ]);
      for (const response of failed) {
        assert.equal(response.error.data.phase, "sse");
        assert.equal(response.error.data.outcome, "not_submitted");
      }
      assert.equal(session, connectionsBefore + 1, "Concurrent calls share one initialization");
      assert.equal(calls.filter(c => c.method === "tools/call").length, toolsBefore);
      assert.ok((await rpc("tools/call", { name: "after_initialization_disconnect" })).result);
      assert.equal(session, connectionsBefore + 2, "A new call reconnects after failed initialization");
      assert.equal(calls.filter(c => c.method === "tools/call").length, toolsBefore + 1, "Only the new tool call is submitted");
    }
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
    upstreamMode = "normal";
    if (child.exitCode === null) child.kill();
  }
}

try {
  await check(false);
  await check(true);
  await check(false, codexLaunch, "Codex manifest");
  await check(false, sharedLaunch, "Claude Code / ZCode shared config");
  await check(false, undefined, "diagnostics", "300", true);
  await check(false, undefined, "minimum timeout", "100");
  await check(false, undefined, "maximum timeout", "300000");
  for (const value of ["", "0", "99", "300001", "1.5", "NaN", "-100", "1e3"]) {
    const child = spawn(process.execPath, [join(root, "scripts/affinity-mcp-proxy.mjs")], {
      env: { ...process.env, AFFINITY_MCP_REQUEST_TIMEOUT_MS: value }, stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "", stdout = "";
    child.stderr.on("data", c => stderr += c);
    child.stdout.on("data", c => stdout += c);
    const closed = once(child, "close");
    child.stdin.end();
    await closed;
    assert.notEqual(child.exitCode, 0, `Reject invalid timeout ${value}`);
    assert.match(stderr, /AFFINITY_MCP_REQUEST_TIMEOUT_MS.*100.*300000/);
    assert.equal(stdout, "");
  }
} finally {
  for (const stream of streams.values()) stream.end();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  rmSync(scratch, { recursive: true, force: true });
}
