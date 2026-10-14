import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, cpSync, rmSync, realpathSync } from "node:fs";
import { join, dirname, resolve, toNamespacedPath } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { checkInstalledConnection } from "../skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs";

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
// Exercise literal replacement characters as well as spaces and Unicode.
const scratch = mkdtempSync(join(tmpdir(), "ai-agent-affinity plugin-中文-$&-$'-$`-${literal}-"));
const pluginFiles = [".codex-plugin", ".claude-plugin", ".agents/plugins", ".mcp.json", "skills", "assets", "README.md", "README.zh-cn.md", "CHANGELOG.md", "LICENSE", "LICENSE.upstream", "NOTICE"];
for (const name of pluginFiles) {
  cpSync(join(root, name), join(scratch, name), { recursive: true });
}

// Exercise the real process boundary; no Affinity documents are touched.
const streams = new Map();
const calls = [];
const upstreamReplies = new Map();
const preambleText = "This is a JavaScript SDK for the Affinity by Canva application.\nSDK includes should be in the form require('/document.js').\nThe script execution will not return output so you need to use console.log().";
let session = 0;
let upstreamMode = "normal";
let sseProbe;
let preambleContentOverride;
let initializeResultOverride;
function writeSse(stream, wire) {
  if (sseProbe) sseProbe.sent = Buffer.concat([sseProbe.sent, Buffer.from(wire)]);
  stream.write(wire);
}
const server = createServer(async (req, res) => {
  if (req.url === "/sse") {
    if (["connect_http", "smoke_fallback"].includes(upstreamMode)) {
      if (upstreamMode === "smoke_fallback") upstreamMode = "normal";
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
    const eol = sseProbe?.eol ?? "\r\n";
    writeSse(res, `event: endpoint${eol}data: /message?session=${session}${eol}${sseProbe?.split ? "\r" : eol}`);
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  const msg = JSON.parse(body);
  calls.push(msg);
  const connection = Number(new URL(req.url, "http://localhost").searchParams.get("session"));
  const stream = streams.get(connection);
  if (!Object.hasOwn(msg, "method")) {
    const mode = upstreamReplies.get(`${connection}:${msg.id}`);
    if (mode === "stale") stream.end();
    if (mode === "fail") res.writeHead(503).end("ping reply refused");
    else if (mode === "delay" || mode === "stale") {
      setTimeout(() => res.writeHead(503).end("late ping reply failure"), mode === "stale" ? 200 : 900);
    } else res.writeHead(202).end();
    return;
  }
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
  // The final CR must dispatch endpoint before this POST can release its LF.
  if (msg.method === "initialize" && sseProbe?.split) writeSse(stream, "\n");
  if (msg.params?.name?.startsWith("upstream_")) {
    const name = msg.params.name;
    const replyMode = name === "upstream_ping_delay" ? "delay"
      : name === "upstream_ping_failure" ? "fail"
      : name === "upstream_ping_stale" ? "stale" : "normal";
    upstreamReplies.set(`${connection}:${msg.id}`, replyMode);
    const incoming = name === "upstream_notification"
      ? { jsonrpc: "2.0", method: "notifications/mock", params: {} }
      : { jsonrpc: "2.0", id: msg.id, method: name === "upstream_unknown" ? "mock/unknown" : "ping", params: name === "upstream_bad_params" ? [] : {} };
    stream.write(`data: ${JSON.stringify(incoming)}\n\n`);
    if (replyMode !== "stale") {
      setTimeout(() => stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `${name} real result` }] } })}\n\n`), 40);
    }
    return;
  }
  if (msg.params?.name === "after_upstream_ping") {
    setTimeout(() => stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "new connection result" }] } })}\n\n`), 200);
    return;
  }
  if (msg.params?.name === "invalid_response") {
    const shapes = {
      missing: {}, both: { result: {}, error: { code: -32001, message: "refused" } },
      null: { result: null }, scalar: { result: 1 }, array: { result: [] },
      error_null: { error: null }, error_code: { error: { code: 1.5, message: "refused" } },
      error_message: { error: { code: -32001, message: 1 } },
    };
    stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, ...shapes[msg.params.arguments.shape] })}\n\n`);
    return;
  }
  if (msg.params?.name === "extended_error") {
    stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: "extended refusal", data: { detail: true }, extension: "allowed" } })}\n\n`);
    return;
  }
  if (msg.method === "tools/list" && msg.params?.cursor === "" && upstreamMode === "empty_cursor_error") {
    stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: "empty cursor refused" } })}\n\n`);
    return;
  }
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
  if (msg.method === "initialize") {
    result = initializeResultOverride ?? { protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "mock", version: "1" } };
    if (upstreamMode === "initialize_invalid_once") { result = {}; upstreamMode = "normal"; }
  }
  if (msg.method === "tools/list") result = Object.hasOwn(msg.params, "cursor")
    ? { tools: [{ name: "second", inputSchema: { type: "object" } }] }
    : { tools: [{ name: "execute_script", inputSchema: { type: "object" } }], nextCursor: "page2" };
  if (msg.method === "tools/list" && !Object.hasOwn(msg.params, "cursor")) {
    if (["smoke_empty_cursor", "smoke_repeated_empty_cursor"].includes(upstreamMode)) result.nextCursor = "";
    if (upstreamMode === "smoke_invalid_cursor") result.nextCursor = null;
  }
  if (msg.method === "tools/list" && Object.hasOwn(msg.params, "cursor")) {
    result.tools.push({ name: "read_sdk_documentation_topic", inputSchema: { type: "object" } });
    if (upstreamMode === "smoke_repeated_cursor") result.nextCursor = "page2";
    if (upstreamMode === "smoke_repeated_empty_cursor") result.nextCursor = "";
  }
  if (msg.method === "tools/call") result = { content: [{ type: "text", text: "中文 SDK result" }, { type: "image", mimeType: "image/jpeg", data: "dGVzdA==" }], isError: false };
  if (msg.params?.name === "read_sdk_documentation_topic") {
    assert.equal(msg.params.arguments.filename, "preamble");
    if (upstreamMode === "smoke_timeout") return;
    if (upstreamMode === "smoke_rpc_error") {
      stream.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32001, message: "refused" } })}\n\n`);
      return;
    }
    result = {
      content: preambleContentOverride ?? (upstreamMode === "smoke_empty" ? [] : [{ type: "text", text: upstreamMode === "smoke_bad_preamble" ? "Error: preamble unavailable" : preambleText }]),
      isError: upstreamMode === "smoke_tool_error",
    };
  }
  // Default SSE event and multiline data are both valid.
  const eol = sseProbe?.eol ?? "\r\n";
  if (msg.method === "tools/call" && sseProbe?.fields) {
    for (const field of [": event", "EVENT", "eventual", "event ", "unknown: message", "event:  message", "event:\tmessage"]) {
      writeSse(stream, `event: ignored${eol}${field}${eol}data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { unexpected: true } })}${eol}${eol}`);
    }
    writeSse(stream, `event: ignored${eol}${sseProbe.fields.eventReset}${eol}DATA: ignored${eol}datax: ignored${eol}data: {"jsonrpc":"2.0","id":${msg.id},${eol}${sseProbe.fields.emptyData}${eol}data: "result":${JSON.stringify(result)}}${eol}${eol}`);
  } else if (msg.method === "tools/call" && sseProbe?.incomplete) {
    writeSse(stream, `data: ${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })}${eol}`);
    stream.end();
  } else if (msg.method === "tools/call" && sseProbe?.split) {
    const wire = Buffer.from(`event: message\rdata: {"jsonrpc":"2.0","id":${msg.id},\ndata: "result":${JSON.stringify(result)}}\r\n\n`);
    const split = wire.indexOf(Buffer.from("中")) + 1;
    assert.ok(split > 0);
    writeSse(stream, wire.subarray(0, split));
    await sseProbe.waitForDecoded();
    writeSse(stream, wire.subarray(split));
  } else {
    writeSse(stream, `data: {"jsonrpc":"2.0","id":${msg.id},${eol}data: "result":${JSON.stringify(result)}}${eol}${eol}`);
  }
});
server.listen(0, "127.0.0.1");
await once(server, "listening");

async function check(framed, launch, label = "direct", timeout, diagnostics = false) {
  const env = { ...process.env, ...launch?.env, AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}`, AFFINITY_MCP_PROTOCOL_VERSION: "2025-03-26" };
  delete env.AFFINITY_MCP_REQUEST_TIMEOUT_MS;
  if (timeout !== undefined) env.AFFINITY_MCP_REQUEST_TIMEOUT_MS = timeout;
  const child = spawn(launch?.command ?? process.execPath,
    launch ? launch.args.map(arg => arg.replaceAll("${CLAUDE_PLUGIN_ROOT}", () => scratch)) : [join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs")], {
    cwd: launch?.cwd ? resolve(scratch, launch.cwd) : tmpdir(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = Buffer.alloc(0);
  let stderr = "";
  let id = 0;
  const pending = new Map();
  const responses = new Map();
  const expectedResponses = new Set();
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
  function waitForResponse(key, method, waitMs = 2500) {
    expectedResponses.add(key);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} ${framed ? "framed" : "newline"} ${method} id=${key}: no response; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`)), waitMs);
      pending.set(key, msg => { clearTimeout(timer); resolve(msg); });
    });
  }
  const encode = body => Buffer.from(framed ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : `${body}\n`);
  async function rpc(method, params = {}, waitMs = 2500) {
    const key = ++id;
    const response = waitForResponse(key, method, waitMs);
    const wire = encode(JSON.stringify({ jsonrpc: "2.0", id: key, method, params }));
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
    const unicodeWire = encode(JSON.stringify({ jsonrpc: "2.0", id: "中文-id", method: "ping" }));
    const split = unicodeWire.indexOf(Buffer.from("中")) + 1;
    assert.ok(split > 0);
    const barrier = waitForResponse("input-barrier", "ping");
    // A reply separates the writes; consecutive writes alone can be coalesced.
    child.stdin.write(Buffer.concat([
      encode(JSON.stringify({ jsonrpc: "2.0", id: "input-barrier", method: "ping" })),
      unicodeWire.subarray(0, split),
    ]));
    assert.deepEqual((await barrier).result, {});
    assert.equal(responses.has("中文-id"), false, "Incomplete UTF-8 input has no response");
    const unicode = waitForResponse("中文-id", "ping");
    child.stdin.write(unicodeWire.subarray(split));
    assert.equal((await unicode).id, "中文-id");

    const batchIds = ["batch-a", "batch-b", "after-bad-json"];
    const batch = batchIds.map(key => waitForResponse(key, "ping"));
    const badJson = waitForResponse(null, "bad JSON");
    child.stdin.write(Buffer.concat([
      ...batchIds.slice(0, 2).map(key => encode(JSON.stringify({ jsonrpc: "2.0", id: key, method: "ping" }))),
      encode("{bad json"),
      encode(JSON.stringify({ jsonrpc: "2.0", method: "ping" })),
      encode(JSON.stringify({ jsonrpc: "2.0", id: batchIds[2], method: "ping" })),
    ]));
    for (const response of await Promise.all(batch)) assert.deepEqual(response.result, {});
    assert.equal((await badJson).error.code, -32700);
    upstreamMode = "connect_http";
    assert.ok((await rpc("tools/list")).result.tools.some(tool => tool.name === "execute_script"), "Offline discovery retains fallback tools");
    upstreamMode = "normal";
    const callsBeforeDiscovery = calls.length;
    const first = (await rpc("tools/list")).result;
    assert.equal(calls.slice(callsBeforeDiscovery).find(call => call.method === "initialize").params.protocolVersion, env.AFFINITY_MCP_PROTOCOL_VERSION, "Affinity negotiation uses its independent configured version");
    assert.equal(calls.slice(callsBeforeDiscovery).find(call => call.method === "initialize").params.clientInfo.version, codex.version, "Upstream clientInfo reports the complete plugin version, including its development suffix");
    assert.equal(first.nextCursor, "page2");
    assert.equal((await rpc("tools/list", { cursor: first.nextCursor })).result.tools[0].name, "second");
    assert.equal((await rpc("tools/list", { cursor: "" })).result.tools[0].name, "second", "An empty string cursor is a valid opaque cursor");
    assert.equal(calls.at(-1).params.cursor, "");
    upstreamMode = "empty_cursor_error";
    assert.equal((await rpc("tools/list", { cursor: "" })).error.data.phase, "upstream", "A failed empty-cursor page must not return the fallback list");
    upstreamMode = "normal";
    assert.ok((await rpc("tools/call", { name: "", _meta: { extension: true } })).result, "A string name and extension fields are accepted without invented schema restrictions");
    assert.deepEqual(calls.at(-1).params.arguments, {}, "Omitted arguments retain the existing empty-object default");
    const result = (await rpc("tools/call", { name: "execute_script", arguments: { script: "console.log('中文')" } })).result;
    assert.equal(result.content[0].text, "中文 SDK result");
    assert.equal(result.content[1].data, "dGVzdA==");
    for (const [name, expected] of [
      ["upstream_ping", { result: {} }],
      ["upstream_unknown", { error: { code: -32601, message: "Unsupported method: mock/unknown" } }],
      ["upstream_bad_params", { error: { code: -32602, message: "params must be an object" } }],
      ["upstream_notification", undefined],
    ]) {
      const before = calls.length;
      const response = await rpc("tools/call", { name });
      assert.equal(response.result.content[0].text, `${name} real result`, "Upstream requests never settle our same-ID pending request");
      const posted = calls.slice(before);
      const replies = posted.filter(call => !Object.hasOwn(call, "method"));
      assert.deepEqual(replies, expected ? [{ jsonrpc: "2.0", id: posted[0].id, ...expected }] : [], "Only upstream requests receive one local reply");
    }
    if (diagnostics) {
      const pingStart = performance.now();
      assert.equal((await rpc("tools/call", { name: "upstream_ping_delay" })).result.content[0].text, "upstream_ping_delay real result");
      assert.ok(performance.now() - pingStart < 650, "Upstream ping POST must not block business SSE responses");
      const pingFailure = (await rpc("tools/call", { name: "upstream_ping_failure" })).error;
      assert.equal(pingFailure.data.phase, "post");
      assert.equal(pingFailure.data.outcome, "unknown");
      assert.ok((await rpc("tools/list")).result.tools.length, "A failed upstream reply allows the next request to reconnect");
      const stale = (await rpc("tools/call", { name: "upstream_ping_stale" })).error;
      assert.equal(stale.data.phase, "sse");
      assert.equal((await rpc("tools/call", { name: "after_upstream_ping" })).result.content[0].text, "new connection result", "An aborted old reply and late HTTP failure do not reject a new connection");
      for (const shape of ["missing", "both", "null", "scalar", "array", "error_null", "error_code", "error_message"]) {
        const invalid = (await rpc("tools/call", { name: "invalid_response", arguments: { shape } })).error;
        assert.equal(invalid.data.phase, "sse", shape);
        assert.equal(invalid.data.outcome, "unknown", shape);
      }
      const extended = (await rpc("tools/call", { name: "extended_error" })).error;
      assert.equal(extended.data.phase, "upstream");
      assert.match(extended.message, /extended refusal.*detail.*extension/);
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
    const validInitialize = { protocolVersion: env.AFFINITY_MCP_PROTOCOL_VERSION, capabilities: {}, serverInfo: { name: "", version: "" } };
    const invalidInitializations = [{}, { ...validInitialize, protocolVersion: "2099-01-01" }, { ...validInitialize, protocolVersion: "" }];
    for (const field of ["protocolVersion", "capabilities", "serverInfo"]) invalidInitializations.push({ ...validInitialize, [field]: undefined });
    for (const field of ["name", "version"]) invalidInitializations.push({ ...validInitialize, serverInfo: { ...validInitialize.serverInfo, [field]: undefined } });
    for (const value of [null, 42, false, { secret: "synthetic-private-marker" }, []]) {
      invalidInitializations.push({ ...validInitialize, protocolVersion: value });
      for (const field of ["name", "version"]) invalidInitializations.push({ ...validInitialize, serverInfo: { ...validInitialize.serverInfo, [field]: value } });
    }
    for (const value of [null, "synthetic-private-marker", 42, false, []]) {
      for (const field of ["capabilities", "serverInfo"]) invalidInitializations.push({ ...validInitialize, [field]: value });
    }
    for (const malformed of label === "direct" ? invalidInitializations : invalidInitializations.slice(0, 3)) {
      await rpc("tools/call", { name: "disconnect" });
      initializeResultOverride = malformed;
      const before = calls.length, connections = session;
      for (const response of await Promise.all([rpc("tools/call", { name: "never_submitted" }), rpc("tools/call", { name: "never_submitted" })])) {
        assert.equal(response.error?.code, -32603, "Invalid upstream initialization cannot succeed");
        assert.equal(response.error.data.phase, "upstream");
        assert.equal(response.error.data.method, "initialize");
        assert.equal(response.error.data.outcome, "not_submitted");
        assert.doesNotMatch(response.error.message, /synthetic-private-marker|Check the configured endpoint/);
      }
      assert.equal(session, connections + 1, "Concurrent calls share one failed initialization");
      assert.deepEqual(calls.slice(before).map(call => call.method), ["initialize"], "Invalid initialization sends no notification or business request");
      initializeResultOverride = undefined;
      assert.ok((await rpc("tools/call", { name: "after_invalid_initialization" })).result);
      assert.equal(session, connections + 2, "An independent call reconnects after invalid initialization");
      assert.deepEqual(calls.slice(before).map(call => call.method), ["initialize", "initialize", "notifications/initialized", "tools/call"]);
    }
    for (const result of [validInitialize, { ...validInitialize, capabilities: { tools: {}, experimental: { mock: {} } }, serverInfo: { ...validInitialize.serverInfo, title: "Mock" }, instructions: "optional", extension: true }]) {
      await rpc("tools/call", { name: "disconnect" });
      initializeResultOverride = result;
      assert.ok((await rpc("tools/call", { name: "valid_minimal_or_extended_initialization" })).result);
    }
    initializeResultOverride = undefined;
    assert.ok((await rpc("tools/list")).result.tools.length, "Next request reconnects");
    const closed = once(child, "close");
    child.stdin.end();
    await Promise.race([closed, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} ${framed ? "framed" : "newline"}: Proxy did not exit on stdin EOF; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`)), 2500);
      timer.unref();
    })]);
    assert.equal(child.exitCode, 0, `${label} ${framed ? "framed" : "newline"}; exitCode=${child.exitCode}; signal=${child.signalCode}; stderr:\n${stderr}`);
    assert.equal(buffer.length, 0, "No incomplete output remains after EOF");
    assert.deepEqual(new Set(responses.keys()), expectedResponses, "No unexpected responses, including notifications");
    assert.ok([...responses.values()].every(n => n === 1), "Each expected response arrives exactly once, including parse errors");
    console.log(`PASS ${label} ${framed ? "legacy Content-Length" : "MCP newline"}: UTF-8 split, batch/recovery/notification silence, discovery, SDK call, image, POST failure, disconnect, reconnect, EOF`);
  } finally {
    upstreamMode = "normal";
    initializeResultOverride = undefined;
    if (child.exitCode === null) child.kill();
  }
}

async function checkSseLineEndings(eol, split = false, incomplete = false, fields) {
  const proxy = join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs");
  const observer = `
    const NativeDecoder = globalThis.TextDecoder;
    let nextId = 0;
    globalThis.TextDecoder = class extends NativeDecoder {
      constructor(...args) { super(...args); this.observerId = ++nextId; }
      decode(...args) {
        const result = super.decode(...args);
        if (args[1]?.stream && args[0]?.byteLength && process.connected) {
          process.send({ decoder: this.observerId, bytes: Array.from(args[0]) });
        }
        return result;
      }
    };
    const nativeParse = JSON.parse;
    JSON.parse = function (text, ...args) {
      const result = nativeParse.call(this, text, ...args);
      if (typeof text === "string" && text.includes("中文 SDK result") && process.connected) process.send({ parsed: text });
      return result;
    };
    await import(${JSON.stringify(pathToFileURL(proxy).href)});
  `;
  const observed = split || fields?.observe;
  const child = spawn(process.execPath, observed ? ["--input-type=module", "--eval", observer] : [proxy], {
    env: { ...process.env, AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}`, AFFINITY_MCP_REQUEST_TIMEOUT_MS: "1000" },
    stdio: observed ? ["pipe", "pipe", "pipe", "ipc"] : ["pipe", "pipe", "pipe"],
  });
  const decoded = new Map();
  const parsed = [];
  let decodedWait;
  const hasDecoded = prefix => [...decoded.values()].some(bytes => bytes.length >= prefix.length && bytes.subarray(0, prefix.length).equals(prefix));
  child.on("message", message => {
    if (message.parsed !== undefined) { parsed.push(message.parsed); return; }
    decoded.set(message.decoder, Buffer.concat([decoded.get(message.decoder) ?? Buffer.alloc(0), Buffer.from(message.bytes)]));
    if (decodedWait && hasDecoded(decodedWait.prefix)) { decodedWait.resolve(); decodedWait = undefined; }
  });
  sseProbe = { eol, split, incomplete, fields, sent: Buffer.alloc(0), waitForDecoded() {
    const prefix = this.sent;
    if (hasDecoded(prefix)) return Promise.resolve();
    return new Promise(resolve => { decodedWait = { prefix, resolve }; });
  } };
  const before = calls.length, connections = session;
  let output = Buffer.alloc(0), stderr = "", timer;
  const response = new Promise(resolve => child.stdout.on("data", chunk => { output = Buffer.concat([output, chunk]); if (output.includes(10)) resolve(); }));
  child.stderr.on("data", chunk => stderr += chunk);
  const closed = once(child, "close");
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("SSE line-ending probe timed out")), 6500); });
  try {
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: "sse-lines", method: "tools/call", params: { name: "line-endings-probe", arguments: {} } })}\n`);
    await Promise.race([response, closed.then(() => { throw new Error("SSE probe exited before responding"); }), deadline]);
    const reply = JSON.parse(output.toString("utf8").trim());
    assert.equal(reply.jsonrpc, "2.0");
    assert.equal(reply.id, "sse-lines");
    if (incomplete) {
      assert.equal(reply.error.code, -32603);
      assert.equal(reply.error.data.phase, "sse");
      assert.equal(reply.error.data.outcome, "unknown");
    } else {
      assert.deepEqual(reply, { jsonrpc: "2.0", id: "sse-lines", result: { content: [{ type: "text", text: "中文 SDK result" }, { type: "image", mimeType: "image/jpeg", data: "dGVzdA==" }], isError: false } });
    }
    child.stdin.end();
    await Promise.race([closed, deadline]);
    assert.equal(child.exitCode, 0, stderr);
    assert.equal(stderr, "");
    assert.deepEqual(output.toString("utf8").trim().split("\n").map(line => JSON.parse(line)), [reply], "Exactly one complete response, with no late or extra output");
    assert.equal(session, connections + 1);
    assert.deepEqual(calls.slice(before).map(call => call.method), ["initialize", "notifications/initialized", "tools/call"]);
    if (fields?.observe) {
      const call = calls.at(-1);
      assert.deepEqual(parsed, [`{"jsonrpc":"2.0","id":${call.id},\n\n"result":${JSON.stringify(reply.result)}}\n`], "Every empty data field appends one LF before JSON parsing");
    }
    console.log(`PASS SSE ${JSON.stringify(eol)}${split ? " split CRLF, mixed endings, observed UTF-8 split" : ""}${incomplete ? " incomplete EOF is discarded" : ""}${fields ? ` fields ${JSON.stringify(fields)}` : ""}`);
  } finally {
    clearTimeout(timer);
    sseProbe = undefined;
    if (child.exitCode === null) child.kill();
  }
}

async function checkStdioDetection() {
  const badPrefixes = ["corrupt\n", "Corrupt\n", "x\n", "content-lengt\n", "Content-Length: nope\r\n\r\n", "Content-Length: 40x\r\n\r\n", "Content-Length: 3\n", "Content-Type: application/json\r\n", "Corrupt-Header: yes\r\n\r\n"];
  const headers = [
    length => `Content-Length: ${length}\r\n`,
    length => `cOnTeNt-LeNgTh:\t ${length} \t\r\n`,
    length => `Content-Type: application/vscode-jsonrpc; charset=utf-8\r\ncOnTeNt-LeNgTh: ${length}\r\nX-Extension: allowed\r\n`,
    length => `Custom-Header: allowed\r\nContent-Length: ${length}\r\n`,
    length => `Custom-Content-Length: 999\r\nContent-Length: ${length}\r\n`,
    length => `Content-Type: application/json; content-length: 1\r\nContent-Length: ${length}\r\n`,
    length => `Content-Type: allowed\u2028content-length: 1\r\nContent-Length: ${length}\r\n`,
    length => `Content-Type: allowed\u2029content-length: 1\r\nContent-Length: ${length}\r\n`,
  ];
  const cases = [...badPrefixes.map(prefix => ({ prefix })), ...headers.map(header => ({ header })), { prefix: "Corrupt\n", observed: true }, { header: headers[2], observed: true }];
  const requests = ["中文-detect", "after-detection"].map(id => ({ jsonrpc: "2.0", id, method: "ping" }));
  const before = calls.length, connections = session;
  for (const { prefix = "", header, observed = false } of cases) {
    const encode = message => {
      const body = JSON.stringify(message);
      return Buffer.from(header ? `${header(Buffer.byteLength(body))}\r\n${body}` : `${body}\n`);
    };
    const wire = Buffer.concat([Buffer.from(prefix), ...requests.map(encode)]);
    const proxy = join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs");
    const observer = `
      await import(${JSON.stringify(pathToFileURL(proxy).href)});
      process.stdin.on("data", bytes => process.send({ stdinBytes: bytes.length }));
      process.send({ ready: true });
    `;
    const child = spawn(process.execPath, observed ? ["--input-type=module", "--eval", observer] : [proxy], {
      cwd: tmpdir(), env: { ...process.env, AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}`, AFFINITY_MCP_REQUEST_TIMEOUT_MS: "300" },
      stdio: observed ? ["pipe", "pipe", "pipe", "ipc"] : ["pipe", "pipe", "pipe"],
    });
    const ready = observed ? once(child, "message") : undefined;
    let inputBytes = 0, sentBytes = 0, acknowledge, timer;
    child.on("message", message => {
      if (message.stdinBytes === undefined) return;
      inputBytes += message.stdinBytes;
      if (inputBytes === sentBytes) { acknowledge?.(); acknowledge = undefined; }
    });
    let output = Buffer.alloc(0), stderr = "";
    child.stdout.on("data", chunk => output = Buffer.concat([output, chunk]));
    child.stderr.on("data", chunk => stderr += chunk);
    const closed = once(child, "close");
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("stdio detection probe timed out")), 5000); });
    try {
      if (observed) {
        assert.deepEqual((await Promise.race([ready, deadline]))[0], { ready: true });
        const headerEnd = header ? wire.indexOf("\r\n\r\n") + 4 : 0;
        const cuts = header
          ? [...Array.from({ length: headerEnd }, (_, i) => i + 1), wire.indexOf(Buffer.from("中")) + 1, wire.length]
          : [1, Buffer.byteLength(prefix), wire.length];
        let start = 0;
        for (const end of cuts) {
          assert.ok(end > start);
          const received = new Promise(resolve => { acknowledge = resolve; });
          sentBytes = end;
          child.stdin.write(wire.subarray(start, end));
          await Promise.race([received, deadline]);
          assert.equal(inputBytes, end, "The real stdin handler received this chunk before the next write");
          start = end;
        }
        child.stdin.end();
      } else child.stdin.end(wire);
      await Promise.race([closed, deadline]);
      assert.equal(child.exitCode, 0, stderr);
      assert.equal(stderr, "");
      const actual = [];
      while (output.length) {
        let start = 0, end;
        if (header) {
          const separator = output.indexOf("\r\n\r\n");
          assert.ok(separator >= 0, "Complete legacy output header");
          start = separator + 4;
          end = start + Number(output.subarray(0, separator).toString().match(/Content-Length: (\d+)/i)[1]);
        } else end = output.indexOf("\n");
        assert.ok(end >= start && end <= output.length, "Complete detection output");
        actual.push(JSON.parse(output.subarray(start, end).toString("utf8")));
        output = output.subarray(end + (header ? 0 : 1));
      }
      const expected = prefix.split("\n").filter(line => line.trim()).map(() => ({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }));
      expected.push(...requests.map(request => ({ jsonrpc: "2.0", id: request.id, result: {} })));
      assert.deepEqual(actual, expected, "First-input recovery and both subsequent replies use the selected framing exactly once");
    } finally {
      clearTimeout(timer);
      if (child.exitCode === null) child.kill();
    }
  }
  assert.equal(calls.length, before);
  assert.equal(session, connections);
  console.log("PASS stdio detection: c/C recovery, header-like bad input, legacy header order/case/extensions and observed header/UTF-8 splits");
}

async function checkInvalidRequests(framed) {
  const input = [], expected = [];
  const encode = message => {
    const body = JSON.stringify(message);
    return Buffer.from(framed ? `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}` : `${body}\n`);
  };
  const reject = (message, id, code, text) => {
    input.push(message);
    expected.push({ jsonrpc: "2.0", id, error: { code, message: text } });
  };
  for (const id of [null, true, false, {}, [], 1.5]) {
    reject({ jsonrpc: "2.0", id, method: "ping" }, null, -32600, "Invalid JSON-RPC request");
  }
  for (const message of [null, [], {}, { jsonrpc: "1.0", id: "bad-version", method: "ping" }, { jsonrpc: "2.0", id: "bad-method", method: 1 }]) {
    reject(message, message?.id ?? null, -32600, "Invalid JSON-RPC request");
  }
  let id = 100;
  for (const method of ["initialize", "ping", "tools/list", "tools/call", "resources/list", "prompts/list"]) {
    for (const params of [null, "bad", 1, false, []]) {
      reject({ jsonrpc: "2.0", id: ++id, method, params }, id, -32602, "params must be an object");
    }
  }
  for (const params of [undefined, {}, { name: null }, { name: {} }, { name: [] }, { name: false }, { name: 1 },
    ...[null, "bad", 1, false, []].map(argumentsValue => ({ name: "execute_script", arguments: argumentsValue }))]) {
    reject({ jsonrpc: "2.0", id: ++id, method: "tools/call", params }, id, -32602, "tools/call requires a string name and object arguments");
  }
  for (const cursor of [null, 1, false, {}, []]) {
    reject({ jsonrpc: "2.0", id: ++id, method: "tools/list", params: { cursor } }, id, -32602, "cursor must be a string");
  }
  input.push({ jsonrpc: "2.0", method: "ping" }, { jsonrpc: "2.0", method: "unknown", params: "bad" }, { jsonrpc: "2.0", method: "tools/call", params: { name: {} } });
  for (const key of ["", 0, -1, "after-invalid-input"]) {
    input.push({ jsonrpc: "2.0", id: key, method: "ping", params: { _meta: { extension: true } }, extension: true });
    expected.push({ jsonrpc: "2.0", id: key, result: {} });
  }
  const before = calls.length, connections = session;
  const child = spawn(process.execPath, [join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs")], {
    cwd: tmpdir(), env: { ...process.env, AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}`, AFFINITY_MCP_REQUEST_TIMEOUT_MS: "300" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = Buffer.alloc(0), stderr = "";
  child.stdout.on("data", chunk => output = Buffer.concat([output, chunk]));
  child.stderr.on("data", chunk => stderr += chunk);
  try {
    const closed = once(child, "close");
    child.stdin.end(Buffer.concat(input.map(encode)));
    await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Invalid-input process did not exit")), 5000); timer.unref(); })]);
    assert.equal(child.exitCode, 0, stderr);
    const actual = [];
    while (output.length) {
      let start = 0, end;
      if (framed) {
        const separator = output.indexOf("\r\n\r\n");
        assert.ok(separator >= 0, "Complete output frame");
        start = separator + 4;
        end = start + Number(output.subarray(0, separator).toString().match(/Content-Length: (\d+)/i)[1]);
      } else end = output.indexOf("\n");
      assert.ok(end >= start && end <= output.length, "Complete output message");
      actual.push(JSON.parse(output.subarray(start, end).toString()));
      output = output.subarray(end + (framed ? 0 : 1));
    }
    assert.deepEqual(actual, expected, "Every invalid request produces exactly its specified error; valid notifications remain silent");
    assert.equal(calls.length, before, "Rejected input and notifications never submit upstream messages");
    assert.equal(session, connections, "Rejected input never connects to Affinity");
    assert.equal(stderr, "");
    console.log(`PASS invalid requests ${framed ? "legacy Content-Length" : "MCP newline"}: IDs, params, name, arguments, cursor, notification silence and recovery`);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

try {
  await checkStdioDetection();
  await checkSseLineEndings("\r");
  await checkSseLineEndings("\n");
  await checkSseLineEndings("\r\n", true);
  await checkSseLineEndings("\r\n", false, true);
  await checkSseLineEndings("\n", false, false, { eventReset: "event:", emptyData: "data", observe: true });
  for (const suffix of ["", ":", ": "]) {
    await checkSseLineEndings("\n", false, false, { eventReset: `event${suffix}`, emptyData: `data${suffix}` });
    await checkSseLineEndings("\n", false, false, { eventReset: `event${suffix}`, emptyData: `data${suffix}`, observe: true });
  }
  await checkInvalidRequests(false);
  await checkInvalidRequests(true);
  await check(false);
  await check(true);
  await check(false, codexLaunch, "Codex manifest");
  await check(false, sharedLaunch, "Claude Code / ZCode shared config");
  await check(false, undefined, "diagnostics", "300", true);
  await check(false, undefined, "minimum timeout", "100");
  await check(false, undefined, "maximum timeout", "300000");
  for (const value of ["", "0", "99", "300001", "1.5", "NaN", "-100", "1e3"]) {
    const child = spawn(process.execPath, [join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs")], {
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
  const mockEnv = { AFFINITY_MCP_BASE_URL: `http://127.0.0.1:${server.address().port}` };
  for (const [file, value] of [
    [".codex-plugin/plugin.json", { ...codex, mcpServers: { "affinity-by-canva": { ...codexLaunch, env: { ...codexLaunch.env, ...mockEnv } } } }],
    [".claude-plugin/plugin.json", claude],
    [".mcp.json", { mcpServers: { "affinity-by-canva": { ...sharedLaunch, env: { ...sharedLaunch.env, ...mockEnv } } } }],
  ]) {
    mkdirSync(dirname(join(scratch, file)), { recursive: true });
    writeFileSync(join(scratch, file), JSON.stringify(value));
  }
  for (const config of ["codex", "shared"]) {
    const before = calls.length;
    const checked = await checkInstalledConnection(scratch, config);
    assert.equal(checked.status, "PASS");
    assert.equal(checked.pluginRoot, realpathSync(scratch));
    assert.equal(checked.pluginVersion, codex.version);
    assert.equal(checked.proxySha256, createHash("sha256").update(readFileSync(join(scratch, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"))).digest("hex"));
    assert.match(checked.nodeVersion, /^v\d+\.\d+\.\d+$/);
    assert.equal(checked.applicationBuild, null);
    assert.equal(checked.tools, 3);
    assert.equal(checked.fallback, false);
    assert.deepEqual(calls.slice(before).map(c => c.method), ["initialize", "notifications/initialized", "tools/list", "tools/list", "tools/call"]);
    assert.equal(calls.at(-1).params.name, "read_sdk_documentation_topic");
  }
  const legacyRoot = join(scratch, "ai-agent-legacy-plugin");
  for (const name of pluginFiles) {
    cpSync(join(scratch, name), join(legacyRoot, name), { recursive: true });
  }
  mkdirSync(join(legacyRoot, "scripts"));
  const legacyProxy = join(legacyRoot, "scripts/affinity-mcp-proxy.mjs");
  copyFileSync(join(legacyRoot, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"), legacyProxy);
  copyFileSync(join(legacyRoot, "skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs"), join(legacyRoot, "scripts/affinity-mcp-smoke.mjs"));
  rmSync(join(legacyRoot, "skills/affinity-mcp/scripts"), { recursive: true });
  for (const [file, launch] of [[".codex-plugin/plugin.json", "codex"], [".mcp.json", "shared"]]) {
    const config = JSON.parse(readFileSync(join(legacyRoot, file), "utf8"));
    config.mcpServers["affinity-by-canva"].args = [launch === "codex" ? "scripts/affinity-mcp-proxy.mjs" : "${CLAUDE_PLUGIN_ROOT}/scripts/affinity-mcp-proxy.mjs"];
    writeFileSync(join(legacyRoot, file), JSON.stringify(config));
    const before = calls.length;
    const checked = await checkInstalledConnection(legacyRoot, launch);
    assert.equal(checked.pluginRoot, realpathSync(legacyRoot));
    assert.equal(checked.pluginVersion, codex.version);
    assert.equal(checked.proxySha256, createHash("sha256").update(readFileSync(legacyProxy)).digest("hex"));
    assert.equal(checked.status, "PASS");
    assert.deepEqual(calls.slice(before).map(c => c.method), ["initialize", "notifications/initialized", "tools/list", "tools/list", "tools/call"]);
  }
  const skillOnly = join(scratch, "ai-agent-skill-only");
  cpSync(join(scratch, "skills/affinity-mcp"), skillOnly, { recursive: true });
  const beforeRejectedInstall = calls.length;
  for (const config of ["codex", "shared"]) await assert.rejects(checkInstalledConnection(skillOnly, config), /Cannot read .*plugin\.json/);
  const installedCodexPath = join(scratch, ".codex-plugin/plugin.json");
  const installedCodex = JSON.parse(readFileSync(installedCodexPath, "utf8"));
  const savedArgs = installedCodex.mcpServers["affinity-by-canva"].args;
  installedCodex.mcpServers["affinity-by-canva"].args = ["skills/affinity-mcp/scripts/other.mjs"];
  writeFileSync(installedCodexPath, JSON.stringify(installedCodex));
  await assert.rejects(checkInstalledConnection(scratch, "codex"), /Unsupported proxy path/);
  installedCodex.mcpServers["affinity-by-canva"].args = savedArgs;
  writeFileSync(installedCodexPath, JSON.stringify(installedCodex));
  assert.equal(calls.length, beforeRejectedInstall, "Bare Skills and arbitrary proxy paths fail before upstream calls");
  console.log("PASS plugin layouts: complete new/legacy plugins, exact identity/hash, bare Skill and arbitrary path refusal");
  for (const config of ["codex", "shared"]) {
    const before = calls.length;
    initializeResultOverride = {};
    await assert.rejects(checkInstalledConnection(scratch, config), { stage: "tools/call", message: /JSON-RPC error -32603/ });
    assert.deepEqual(calls.slice(before).map(call => call.method), ["initialize", "initialize"], "Persistent invalid initialization never submits a notification or business request");
    initializeResultOverride = undefined;
    upstreamMode = "initialize_invalid_once";
    const fallbackBefore = calls.length;
    await assert.rejects(checkInstalledConnection(scratch, config), /fallback/i);
    assert.deepEqual(calls.slice(fallbackBefore).map(call => call.method), ["initialize", "initialize", "notifications/initialized", "tools/call"], "A healthy preamble after failed discovery cannot hide fallback");
  }
  console.log("PASS upstream initialization: invalid fields/version, concurrent rejection, no submission, recovery and both-config smoke refusal");
  const preambleProxy = join(scratch, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs");
  const preambleExitFile = join(scratch, "ai-agent-preamble-exit.json");
  try {
    writeFileSync(preambleProxy, readFileSync(preambleProxy, "utf8") +
      "\nimport { writeFileSync as writePreambleExit } from 'node:fs';\n" +
      "const preambleExitFile = " + JSON.stringify(preambleExitFile) + ";\n" +
      "writePreambleExit(preambleExitFile, JSON.stringify({ pid: process.pid }));\n" +
      "process.on('exit', code => writePreambleExit(preambleExitFile, JSON.stringify({ pid: process.pid, code })));\n");
    for (const config of ["codex", "shared"]) {
      rmSync(preambleExitFile, { force: true });
      preambleContentOverride = [{ type: "text", text: [preambleText] }];
      await assert.rejects(checkInstalledConnection(scratch, config), error => {
        assert.match(error.message, /Invalid preamble text content/);
        assert.equal(error.stage, "tools/call");
        return true;
      });
      const exited = JSON.parse(readFileSync(preambleExitFile, "utf8"));
      assert.equal(exited.code, 0, "Invalid text still shuts down normally on stdin EOF");
      assert.throws(() => process.kill(exited.pid, 0), { code: "ESRCH" }, "The invalid-text check leaves no child process");
      for (const text of [[preambleText], { markers: preambleText }, 42, false, null, undefined]) {
        preambleContentOverride = [{ type: "text", text: preambleText }, { type: "text", text }];
        await assert.rejects(checkInstalledConnection(scratch, config), error => {
          assert.match(error.message, /Invalid preamble text content/);
          assert.equal(error.stage, "tools/call");
          return true;
        });
      }
      preambleContentOverride = preambleText.split("\n").map(text => ({ type: "text", text }));
      preambleContentOverride.splice(1, 0, { type: "image", mimeType: "image/jpeg", data: "dGVzdA==" });
      assert.equal((await checkInstalledConnection(scratch, config)).status, "PASS", "Valid multiple text blocks and image content remain supported");
    }
  } finally {
    preambleContentOverride = undefined;
    copyFileSync(join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"), preambleProxy);
    rmSync(preambleExitFile, { force: true });
  }
  console.log("PASS preamble text validation: malformed and mixed blocks fail, valid multi-block text, both configs and EOF cleanup");
  for (const config of ["codex", "shared"]) {
    const before = calls.length;
    upstreamMode = "smoke_empty_cursor";
    const checked = await checkInstalledConnection(scratch, config);
    upstreamMode = "normal";
    assert.equal(checked.status, "PASS");
    assert.equal(checked.tools, 3);
    const posted = calls.slice(before);
    assert.deepEqual(posted.map(c => c.method), ["initialize", "notifications/initialized", "tools/list", "tools/list", "tools/call"]);
    assert.deepEqual(posted.filter(c => c.method === "tools/list").map(c => c.params), [{}, { cursor: "" }], "The opaque empty cursor is forwarded unchanged");
    assert.equal(posted.at(-1).params.arguments.filename, "preamble");
    for (const [mode, pages] of [["smoke_repeated_empty_cursor", 2], ["smoke_invalid_cursor", 1]]) {
      const start = calls.length;
      upstreamMode = mode;
      await assert.rejects(checkInstalledConnection(scratch, config), /Invalid or repeated tools\/list cursor/);
      upstreamMode = "normal";
      assert.deepEqual(calls.slice(start).map(c => c.method), ["initialize", "notifications/initialized", ...Array(pages).fill("tools/list")], "Invalid or repeated cursors fail before preamble, without looping to the deadline");
    }
  }
  const execNode = promisify(execFile);
  const smokeEntry = join(scratch, "skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs");
  const entries = process.platform === "win32" ? [smokeEntry, toNamespacedPath(smokeEntry)] : [smokeEntry];
  for (const entry of entries) {
    for (const config of ["codex", "shared"]) {
      const before = calls.length;
      const result = await execNode(process.execPath, [entry, "--plugin-root", scratch, "--config", config], { cwd: tmpdir(), timeout: 10000, windowsHide: true });
      assert.equal(result.stderr, "");
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "PASS", "The direct smoke entry must actually execute");
      assert.equal(summary.pluginRoot, realpathSync(scratch));
      assert.equal(summary.configuration, config);
      assert.equal(summary.tools, 3);
      assert.equal(summary.fallback, false);
      assert.deepEqual(calls.slice(before).map(c => c.method), ["initialize", "notifications/initialized", "tools/list", "tools/list", "tools/call"]);
    }
    for (const args of [["--plugin-root", "relative", "--config", "codex"], ["--unknown"]]) {
      await assert.rejects(execNode(process.execPath, [entry, ...args], { cwd: tmpdir(), timeout: 10000, windowsHide: true }), error => {
        assert.equal(error.code, 1, "Invalid CLI input must fail even for an equivalent entry path");
        assert.equal(error.stdout, "");
        assert.match(error.stderr, /FAIL configuration:/);
        return true;
      });
    }
  }
  const beforeImport = calls.length;
  const imported = await execNode(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(smokeEntry).href)}); console.log('import-only');`], { cwd: tmpdir(), timeout: 10000, windowsHide: true });
  assert.equal(imported.stdout.trim(), "import-only");
  assert.equal(imported.stderr, "");
  assert.equal(calls.length, beforeImport, "Importing the smoke module never runs its CLI");
  console.log("PASS smoke CLI: direct success/failure, Windows namespaced entry when applicable, and side-effect-free import");
  for (const [mode, expected, budget] of [
    ["smoke_fallback", /fallback/i],
    ["smoke_repeated_cursor", /cursor/i],
    ["smoke_rpc_error", /JSON-RPC/i],
    ["smoke_tool_error", /isError/i],
    ["smoke_empty", /preamble/i],
    ["smoke_bad_preamble", /preamble/i],
    ["smoke_timeout", /timed out/i, 1500],
  ]) {
    upstreamMode = mode;
    await assert.rejects(checkInstalledConnection(scratch, "codex", budget), expected);
    upstreamMode = "normal";
  }
  const proxyCopy = join(scratch, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs");
  const pidFile = join(scratch, "ai-agent-child-pid.txt");
  writeFileSync(proxyCopy, readFileSync(proxyCopy, "utf8") +
    "\nimport { writeFileSync as writePid } from 'node:fs';\n" +
    "writePid(" + JSON.stringify(pidFile) + ", String(process.pid));\n" +
    "process.stdin.removeAllListeners('end');\nsetInterval(() => {}, 1000);\n");
  await assert.rejects(checkInstalledConnection(scratch, "codex"), /stdin EOF/);
  const stoppedPid = Number(readFileSync(pidFile, "utf8"));
  assert.throws(() => process.kill(stoppedPid, 0), { code: "ESRCH" }, "Forced cleanup confirms the child has exited");
  copyFileSync(join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"), proxyCopy);
  writeFileSync(proxyCopy, readFileSync(proxyCopy, "utf8") +
    "\nprocess.stdin.removeAllListeners('end');\n" +
    "process.stdin.on('end', () => { console.error('Affinity discovery unavailable; using fallback tools: late diagnostic'); process.exit(0); });\n");
  await assert.rejects(checkInstalledConnection(scratch, "codex"), /fallback/i);
  copyFileSync(join(root, "skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"), proxyCopy);
  await assert.rejects(checkInstalledConnection("relative", "codex"), /absolute/i);
  await assert.rejects(checkInstalledConnection(scratch, "unknown"), /config/i);
  const sharedPath = join(scratch, ".mcp.json");
  const installedShared = JSON.parse(readFileSync(sharedPath, "utf8"));
  installedShared.mcpServers["affinity-by-canva"].args = ["${UNKNOWN}/skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs"];
  writeFileSync(sharedPath, JSON.stringify(installedShared));
  await assert.rejects(checkInstalledConnection(scratch, "shared"), /variable/i);
  installedShared.mcpServers["affinity-by-canva"].args = sharedLaunch.args;
  installedShared.mcpServers["affinity-by-canva"].command = join("${CLAUDE_PLUGIN_ROOT}", "missing", "node.exe");
  writeFileSync(sharedPath, JSON.stringify(installedShared));
  await assert.rejects(checkInstalledConnection(scratch, "shared"), /Node version/i);
  console.log("PASS installed smoke: both configs, pagination, identity, fallback, JSON-RPC/tool errors, empty/invalid preamble, timeout and invalid launchers");
} finally {
  for (const stream of streams.values()) stream.end();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  rmSync(scratch, { recursive: true, force: true });
}
