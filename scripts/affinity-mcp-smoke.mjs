#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { parseArgs, promisify } from "node:util";

export async function checkInstalledConnection(root, configuration, timeoutMs = 60000) {
  assert.ok(typeof root === "string" && isAbsolute(root), "--plugin-root must be an absolute directory");
  assert.ok(["codex", "shared"].includes(configuration), "--config must be codex or shared");
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0, "Invalid check timeout");
  const pluginRoot = realpathSync(root);
  const readJson = file => {
    try { return JSON.parse(readFileSync(join(pluginRoot, file), "utf8")); }
    catch (error) { throw new Error("Cannot read " + file + " (" + (error.code || "invalid JSON") + ")"); }
  };
  const manifest = readJson(configuration === "codex" ? ".codex-plugin/plugin.json" : ".claude-plugin/plugin.json");
  const launch = (configuration === "codex" ? manifest : readJson(".mcp.json")).mcpServers?.["affinity-by-canva"];
  assert.ok(manifest.name === "affinity-mcp" && typeof manifest.version === "string", "Unsupported plugin manifest");
  assert.ok(launch && launch.enabled !== false && (!launch.type || launch.type === "stdio"), "Unsupported or disabled MCP config");
  assert.ok(typeof launch.command === "string" && Array.isArray(launch.args) && launch.args.length === 1, "Unsupported launcher shape");
  assert.ok(launch.env && typeof launch.env === "object" && !Array.isArray(launch.env), "Invalid launcher environment");
  const expand = value => {
    assert.equal(typeof value, "string", "Launcher values must be strings");
    const variable = "$" + "{CLAUDE_PLUGIN_ROOT}";
    assert.ok(!/\$\{[^}]*\}/.test(value.replaceAll(variable, "")), "Unknown launcher variable");
    return value.replaceAll(variable, () => pluginRoot);
  };
  const command = expand(launch.command);
  assert.ok(["node", "node.exe"].includes(basename(command).toLowerCase()) &&
    (isAbsolute(command) || command === "node" || command === "node.exe"), "Only a Node launcher is supported");
  const cwd = resolve(pluginRoot, expand(launch.cwd ?? "."));
  assert.equal(cwd, pluginRoot, "Only the plugin root cwd is supported");
  const args = launch.args.map(expand);
  const proxyPath = resolve(cwd, args[0]);
  assert.equal(proxyPath, join(pluginRoot, "scripts/affinity-mcp-proxy.mjs"), "Unsupported proxy path");
  const env = { ...process.env };
  for (const [key, value] of Object.entries(launch.env)) {
    if (process.platform === "win32") {
      for (const existing of Object.keys(env)) {
        if (existing.toLowerCase() === key.toLowerCase()) delete env[existing];
      }
    }
    env[key] = expand(value);
  }
  const proxySha256 = createHash("sha256").update(readFileSync(proxyPath)).digest("hex");
  const deadline = Date.now() + timeoutMs;
  let nodeVersion;
  try {
    const { stdout } = await promisify(execFile)(command, ["--version"], {
      cwd, env, shell: false, windowsHide: true, timeout: Math.min(5000, timeoutMs), maxBuffer: 4096,
    });
    nodeVersion = stdout.trim();
    assert.match(nodeVersion, /^v\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/);
  } catch (error) {
    throw new Error("Node version probe failed (" + (error.code || "invalid output") + ")");
  }

  let stage = "launch", failure, fatalError, closing = false, stderr = "";
  let buffer = Buffer.alloc(0), receivedBytes = 0, id = 0;
  const pending = new Map();
  const child = spawn(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  const fail = error => {
    fatalError ||= error;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(fatalError);
    }
    pending.clear();
  };
  child.on("error", error => fail(new Error("Proxy launch failed (" + error.code + ")")));
  child.stdin.on("error", () => fail(new Error("Proxy stdin failed")));
  const closed = new Promise(resolveClose => child.once("close", (code, signal) => {
    if (!closing) fail(new Error("Proxy exited before the checks completed"));
    resolveClose({ code, signal });
  }));
  child.stderr.on("data", chunk => {
    stderr += chunk.toString();
    if (stderr.length > 1024 * 1024) fail(new Error("Proxy diagnostics exceeded the check limit"));
  });
  child.stdout.on("data", chunk => {
    receivedBytes += chunk.length;
    if (receivedBytes > 8 * 1024 * 1024) {
      fail(new Error("Proxy output exceeded the check limit"));
      return;
    }
    buffer = Buffer.concat([buffer, chunk]);
    try {
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const response = JSON.parse(buffer.subarray(0, end).toString("utf8"));
        buffer = buffer.subarray(end + 1);
        const entry = pending.get(response?.id);
        assert.ok(response?.jsonrpc === "2.0" && entry &&
          Object.hasOwn(response, "result") !== Object.hasOwn(response, "error"), "Unexpected JSON-RPC response");
        pending.delete(response.id);
        clearTimeout(entry.timer);
        if (response.error) entry.reject(new Error(stage + " JSON-RPC error " + response.error.code));
        else entry.resolve(response.result);
      }
    } catch {
      fail(new Error("Invalid or unexpected proxy output"));
    }
  });
  const overallTimer = setTimeout(() => fail(new Error("Connection check timed out")), Math.max(1, deadline - Date.now()));
  const rpc = (method, params) => {
    stage = method;
    if (fatalError) return Promise.reject(fatalError);
    const key = ++id;
    return new Promise((resolveReply, reject) => {
      const timer = setTimeout(() => {
        pending.delete(key);
        reject(new Error(method + " timed out"));
      }, Math.max(1, Math.min(45000, deadline - Date.now())));
      pending.set(key, { resolve: resolveReply, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: key, method, params }) + "\n");
    });
  };
  const waitForClose = async ms => {
    let timer;
    try {
      return await Promise.race([closed, new Promise(resolveWait => {
        timer = setTimeout(() => resolveWait(null), ms);
      })]);
    } finally { clearTimeout(timer); }
  };
  const tools = new Set(), cursors = new Set();
  try {
    const initialized = await rpc("initialize", {
      protocolVersion: "2025-11-25", capabilities: {},
      clientInfo: { name: "affinity-mcp-smoke", version: "1" },
    });
    assert.ok(initialized?.protocolVersion === "2025-11-25" &&
      initialized.serverInfo?.name === manifest.name && initialized.serverInfo?.version === manifest.version,
    "Initialization does not match the selected manifest");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    let cursor;
    do {
      const page = await rpc("tools/list", cursor === undefined ? {} : { cursor });
      assert.ok(Array.isArray(page?.tools), "Invalid tools/list result");
      for (const tool of page.tools) {
        assert.ok(typeof tool?.name === "string" && tool.name.length > 0, "Invalid tool name");
        tools.add(tool.name);
      }
      cursor = page.nextCursor;
      if (cursor !== undefined) {
        assert.ok(typeof cursor === "string" && !cursors.has(cursor), "Invalid or repeated tools/list cursor");
        cursors.add(cursor);
      }
    } while (cursor !== undefined);
    assert.ok(tools.has("read_sdk_documentation_topic"), "Online catalog lacks the preamble reader");
    const preamble = await rpc("tools/call", { name: "read_sdk_documentation_topic", arguments: { filename: "preamble" } });
    assert.ok(preamble && preamble.isError !== true, "Preamble tool returned isError");
    assert.ok(Array.isArray(preamble.content), "Missing preamble content");
    const textBlocks = preamble.content.filter(item => item.type === "text");
    assert.ok(textBlocks.every(item => typeof item.text === "string"), "Invalid preamble text content");
    const text = textBlocks.map(item => item.text).join("\n");
    // shortcut: observed preamble shape; reverify these markers when Affinity changes its SDK prose.
    assert.ok(/JavaScript SDK for the Affinity(?: by Canva)? application/i.test(text) &&
      /require\s*\(\s*['"]\/document(?:\.js)?['"]\s*\)/.test(text) &&
      /console\.log\s*\(\s*\)/.test(text), "Empty or unrecognized SDK preamble");
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(overallTimer);
    closing = true;
    child.stdin.end();
    let exit = await waitForClose(2000);
    if (!exit) {
      child.kill("SIGKILL");
      exit = await waitForClose(2000);
      if (!failure) stage = "cleanup";
      failure ||= new Error(exit ? "Proxy did not exit cleanly on stdin EOF" : "Proxy cleanup failed");
    } else if (exit.code !== 0) {
      failure ||= new Error("Proxy exited unsuccessfully");
    }
  }
  failure ||= fatalError;
  if (buffer.length) failure ||= new Error("Incomplete proxy output after close");
  const fallback = stderr.includes("Affinity discovery unavailable; using fallback tools:");
  if (fallback && !failure) {
    stage = "tools/list";
    failure = new Error("Discovery used fallback tools; online discovery was not verified");
  }
  if (failure) throw Object.assign(failure, { stage });
  return {
    status: "PASS", pluginRoot, configuration, pluginVersion: manifest.version,
    proxySha256, nodeVersion, tools: tools.size, fallback,
    applicationBuild: null, applicationPlatform: null,
  };
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ options: { "plugin-root": { type: "string" }, config: { type: "string" } } });
    console.log(JSON.stringify(await checkInstalledConnection(values["plugin-root"], values.config), null, 2));
  } catch (error) {
    console.error("FAIL " + (error.stage || "configuration") + ": " + error.message);
    process.exitCode = 1;
  }
}
