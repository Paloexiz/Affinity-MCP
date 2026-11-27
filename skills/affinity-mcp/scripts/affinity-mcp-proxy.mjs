#!/usr/bin/env node

const CLIENT_PROTOCOL_VERSION = "2025-11-25";
const AFFINITY_BASE_URL = process.env.AFFINITY_MCP_BASE_URL || "http://localhost:6767";
const AFFINITY_PROTOCOL_VERSION =
  process.env.AFFINITY_MCP_PROTOCOL_VERSION || "2025-11-25";
const timeoutSetting = process.env.AFFINITY_MCP_REQUEST_TIMEOUT_MS;
if (timeoutSetting !== undefined && (!/^\d+$/.test(timeoutSetting) || Number(timeoutSetting) < 100 || Number(timeoutSetting) > 300000)) {
  throw new Error("AFFINITY_MCP_REQUEST_TIMEOUT_MS must be an integer from 100 to 300000 milliseconds");
}
const REQUEST_TIMEOUT_MS = timeoutSetting === undefined ? 30000 : Number(timeoutSetting);

function failure(phase, cause, method) {
  const outcome = method === "tools/call" ? "unknown" : "not_submitted";
  const guidance = outcome === "unknown"
    ? " The tool may have executed. Inspect the target state before retrying; do not replay blindly."
    : phase === "connect" ? " Check the configured endpoint, whether Affinity is running and MCP is enabled." : "";
  return Object.assign(new Error(`Affinity MCP ${phase}: ${cause}.${guidance}`), {
    data: { phase, cause, method, outcome },
  });
}

const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const isRequestId = value => typeof value === "string" || Number.isInteger(value);

const STATIC_TOOLS = [
  {
    name: "add_sdk_hint",
    description: "Add a hint to the Affinity SDK preamble document for future sessions.",
    inputSchema: {
      type: "object",
      properties: { hint: { type: "string", description: "The hint to add." } },
      required: ["hint"],
    },
  },
  {
    name: "execute_script",
    description:
      "Execute JavaScript in Affinity and return results. Read the preamble documentation first.",
    inputSchema: {
      type: "object",
      properties: {
        script: { type: "string", description: "JavaScript to execute in Affinity." },
      },
      required: ["script"],
    },
  },
  {
    name: "list_library_scripts",
    description: "List scripts currently saved in Affinity's script library.",
    inputSchema: { type: "object" },
  },
  {
    name: "list_sdk_documentation",
    description: "List Affinity SDK documentation topics.",
    inputSchema: { type: "object" },
  },
  {
    name: "read_library_script",
    description: "Read a script from Affinity's script library.",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string", description: "The script title." } },
      required: ["title"],
    },
  },
  {
    name: "read_sdk_documentation_topic",
    description:
      "Read an Affinity SDK documentation topic. Call this with filename 'preamble' before other SDK topics.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description: "SDK documentation filename from list_sdk_documentation.",
        },
      },
      required: ["filename"],
    },
  },
  {
    name: "render_selection",
    description: "Render selected Affinity nodes to a base64 JPEG.",
    inputSchema: {
      type: "object",
      properties: {
        document_session_uuid: {
          type: "string",
          description: "The session UUID of the document to render.",
        },
      },
      required: ["document_session_uuid"],
    },
  },
  {
    name: "render_spread",
    description: "Render an Affinity spread to a base64 JPEG.",
    inputSchema: {
      type: "object",
      properties: {
        document_session_uuid: {
          type: "string",
          description: "The session UUID of the document to render.",
        },
        spread_index: {
          type: "number",
          description: "The zero-based index of the spread to render.",
        },
      },
      required: ["document_session_uuid", "spread_index"],
    },
  },
  {
    name: "report_sdk_issue",
    description: "Report a real Affinity SDK issue to Affinity.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Description of the SDK issue." },
        code: { type: "string", description: "JavaScript demonstrating the issue." },
      },
      required: ["description"],
    },
  },
  {
    name: "save_script_to_library",
    description: "Save a completed JavaScript script into Affinity's script library.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Script title." },
        description: { type: "string", description: "Brief script description." },
        code: { type: "string", description: "The JavaScript code." },
      },
      required: ["title", "description", "code"],
    },
  },
  {
    name: "search_sdk_hints",
    description: "Search Affinity SDK hints for a problem or task.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The issue or task to search for." },
      },
      required: ["prompt"],
    },
  },
];

class AffinitySseClient {
  constructor() {
    this.controller = null;
    this.endpointPath = null;
    this.pending = new Map();
    this.nextId = 1;
    this.connected = false;
    this.connecting = null;
    this.streamError = null;
  }

  async connect() {
    if (this.connected) return;
    if (this.connecting) return this.connecting;
    this.connecting = this.#connect();
    try {
      await this.connecting;
    } catch (err) {
      await this.close();
      throw err;
    } finally {
      this.connecting = null;
    }
  }

  async #connect() {
    await this.close();
    this.controller = new AbortController();
    const controller = this.controller;
    this.streamError = null;
    const timer = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(`${AFFINITY_BASE_URL}/sse`, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
        redirect: "error",
      });
    } catch (err) {
      throw failure("connect", err.message);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok || !res.body) {
      throw failure("connect", `SSE HTTP ${res.status}`);
    }
    this.#readSse(res.body, controller);
    await this.#waitForEndpoint();
    const initialized = await this.request("initialize", {
      protocolVersion: AFFINITY_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "affinity-mcp-proxy", version: "0.5.5-dev.3" },
    });
    if (this.streamError) throw this.streamError;
    if (typeof initialized.protocolVersion !== "string" || !isObject(initialized.capabilities) ||
        !isObject(initialized.serverInfo) || typeof initialized.serverInfo.name !== "string" ||
        typeof initialized.serverInfo.version !== "string") {
      throw failure("upstream", "Invalid upstream initialize result", "initialize");
    }
    if (initialized.protocolVersion !== AFFINITY_PROTOCOL_VERSION) {
      throw failure("upstream", "Unsupported upstream protocol version", "initialize");
    }
    await this.#post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }, controller);
    if (this.controller !== controller || controller.signal.aborted || this.streamError || !this.endpointPath) {
      throw this.streamError || failure("sse", "connection closed during initialization");
    }
    this.connected = true;
  }

  async close() {
    this.connected = false;
    this.endpointPath = null;
    if (this.controller) this.controller.abort();
    this.controller = null;
    for (const { reject, timer, method } of this.pending.values()) {
      clearTimeout(timer);
      reject(failure("sse", "connection closed", method));
    }
    this.pending.clear();
  }

  #readSse(body, controller) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "";
    let eventData = "";
    let skipLF = false;

    (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (this.controller !== controller || controller.signal.aborted) return;
          buffer += decoder.decode(value, { stream: true });
          for (;;) {
            if (skipLF) {
              if (!buffer.length) break;
              if (buffer[0] === "\n") buffer = buffer.slice(1);
              skipLF = false;
            }
            const nl = buffer.search(/[\r\n]/);
            if (nl < 0) break;
            const line = buffer.slice(0, nl);
            skipLF = buffer[nl] === "\r";
            buffer = buffer.slice(nl + 1);
            if (line === "") {
              this.#flushEvent(eventName, eventData, controller);
              eventName = "";
              eventData = "";
            } else {
              const colon = line.indexOf(":");
              const field = colon < 0 ? line : line.slice(0, colon);
              const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
              if (field === "event") eventName = value;
              else if (field === "data") eventData += value + "\n";
            }
          }
        }
        this.#endStream(controller, failure("sse", "connection closed"));
      } catch (err) {
        this.#endStream(controller, err.data ? err : failure("sse", err.message));
      } finally {
        reader.releaseLock();
      }
    })();
  }

  #flushEvent(eventName, eventData, controller) {
    if (eventName === "endpoint") {
      const address = eventData.trim();
      if (!address) throw failure("endpoint", "empty endpoint");
      try {
        const endpoint = new URL(address, AFFINITY_BASE_URL);
        if (endpoint.origin !== new URL(AFFINITY_BASE_URL).origin) {
          throw new Error("endpoint must use the configured server origin");
        }
        this.endpointPath = endpoint.href;
      } catch (err) {
        throw failure("endpoint", err.message);
      }
    } else if ((!eventName || eventName === "message") && eventData.trim()) {
      const msg = JSON.parse(eventData);
      if (!isObject(msg) || msg.jsonrpc !== "2.0") {
        throw failure("sse", "Invalid upstream JSON-RPC message");
      }
      if (Object.hasOwn(msg, "method")) {
        if (typeof msg.method !== "string" || (Object.hasOwn(msg, "id") && !isRequestId(msg.id))) {
          throw failure("sse", "Invalid upstream JSON-RPC request");
        }
        if (!Object.hasOwn(msg, "id")) return;
        if (!this.endpointPath) throw failure("endpoint", "endpoint is not ready");
        const reply = { jsonrpc: "2.0", id: msg.id };
        if (Object.hasOwn(msg, "params") && !isObject(msg.params)) {
          reply.error = { code: -32602, message: "params must be an object" };
        } else if (msg.method === "ping") {
          reply.result = {};
        } else {
          reply.error = { code: -32601, message: `Unsupported method: ${msg.method}` };
        }
        // Reply IDs belong to the upstream request, independently of our pending IDs.
        this.#post(reply, controller).catch(err => this.#endStream(controller, err));
        return;
      }
      if (this.pending.has(msg.id)) {
        const hasResult = Object.hasOwn(msg, "result");
        const hasError = Object.hasOwn(msg, "error");
        if (!isRequestId(msg.id) || hasResult === hasError ||
            (hasResult && !isObject(msg.result)) ||
            (hasError && (!isObject(msg.error) || !Number.isInteger(msg.error.code) || typeof msg.error.message !== "string"))) {
          throw failure("sse", "Invalid upstream JSON-RPC response");
        }
        const { resolve, reject, timer, method } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (hasError) reject(failure("upstream", JSON.stringify(msg.error), method));
        else resolve(msg.result);
      }
    }
  }

  #endStream(controller, err) {
    if (this.controller !== controller || this.streamError) return;
    this.streamError = err;
    this.connected = false;
    this.endpointPath = null;
    for (const { reject, timer, method } of this.pending.values()) {
      clearTimeout(timer);
      reject(failure(err.data.phase, err.data.cause, method));
    }
    this.pending.clear();
    controller.abort();
  }

  async #waitForEndpoint() {
    for (let waitsLeft = 50; !this.endpointPath; waitsLeft--) {
      if (this.streamError) throw this.streamError;
      if (waitsLeft === 0) throw failure("endpoint", "Timed out waiting for endpoint");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  async request(method, params) {
    if (!this.endpointPath) throw this.streamError || failure("endpoint", "endpoint is not ready");
    const id = this.nextId++;
    let postComplete = false;
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(failure(postComplete ? "response" : "post", `Timed out waiting for ${method} after ${REQUEST_TIMEOUT_MS} ms`, method));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer, method });
    });

    // The first terminal event wins, including an SSE reply before POST completes.
    // Always observe the POST rejection, even after its request has settled.
    this.#post({ jsonrpc: "2.0", id, method, params }).then(() => {
      postComplete = true;
    }).catch(err => {
      const pending = this.pending.get(id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(err);
      }
    });
    return result;
  }

  async #post(payload, controller = this.controller) {
    if (!controller || this.controller !== controller) throw failure("sse", "connection closed");
    if (this.streamError) throw this.streamError;
    if (controller.signal.aborted) throw failure("sse", "connection closed");
    if (!this.endpointPath) throw failure("endpoint", "endpoint is not ready");
    try {
      const res = await fetch(this.endpointPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        redirect: "error",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text()}`);
    } catch (err) {
      if (this.controller === controller && this.streamError) throw this.streamError;
      throw failure("post", err.message, payload.method);
    }
  }

  async listTools(params = {}) {
    await this.connect();
    return this.request("tools/list", params);
  }

}

const affinity = new AffinitySseClient();
// Client IDs are independent of the transport's upstream pending IDs.
const waitingToolCalls = new Map();
let inputBuffer = Buffer.alloc(0);
let framedStdio;

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  for (;;) {
    if (framedStdio === undefined) {
      if (inputBuffer.length < 1) return;
      // Keep compatibility with clients that used this proxy's old framing.
      if (inputBuffer[0] === 67 || inputBuffer[0] === 99) {
        const separator = inputBuffer.indexOf("\r\n\r\n");
        const prefix = inputBuffer.subarray(0, separator < 0 ? inputBuffer.length : separator + 2).toString("utf8");
        const lines = prefix.split("\n").slice(0, -1);
        const isHeader = lines.every(line => /^[!#$%&'*+.^_`|~0-9A-Za-z-]+:[^\r\n]*\r$/.test(line));
        if (isHeader && separator < 0) return;
        framedStdio = isHeader && lines.some(line => /^content-length:[ \t]*\d+[ \t]*\r$/i.test(line));
      } else framedStdio = false;
    }
    if (!framedStdio) {
      const end = inputBuffer.indexOf("\n");
      if (end < 0) return;
      const rawMessage = inputBuffer.subarray(0, end).toString("utf8");
      inputBuffer = inputBuffer.subarray(end + 1);
      if (rawMessage.trim()) receive(rawMessage);
      continue;
    }
    const separator = inputBuffer.indexOf("\r\n\r\n");
    if (separator < 0) return;
    const header = inputBuffer.slice(0, separator).toString("utf8");
    const match = header.match(/(?:^|\r\n)content-length:[ \t]*(\d+)[ \t]*(?:\r\n|$)/i);
    if (!match) {
      inputBuffer = inputBuffer.slice(separator + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = separator + 4;
    const end = start + length;
    if (inputBuffer.length < end) return;
    const rawMessage = inputBuffer.slice(start, end).toString("utf8");
    inputBuffer = inputBuffer.slice(end);
    receive(rawMessage);
  }
});

function receive(rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendError(null, -32700, "Invalid JSON");
    return;
  }
  if (!isObject(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string" ||
      (Object.hasOwn(message, "id") && !isRequestId(message.id))) {
    sendError(isObject(message) && isRequestId(message.id) ? message.id : null, -32600, "Invalid JSON-RPC request");
    return;
  }
  if (!Object.hasOwn(message, "id")) {
    const params = message.params;
    if (message.method === "notifications/cancelled" && isObject(params) && isRequestId(params.requestId) &&
        (!Object.hasOwn(params, "reason") || typeof params.reason === "string") &&
        (!Object.hasOwn(params, "_meta") || isObject(params._meta))) {
      waitingToolCalls.delete(params.requestId);
    }
    return;
  }
  if (Object.hasOwn(message, "params") && !isObject(message.params)) {
    sendError(message.id, -32602, "params must be an object");
    return;
  }
  handleMessage(message).catch(err => sendError(message.id, -32603, err.message));
}

process.stdin.on("end", async () => {
  await affinity.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await affinity.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await affinity.close();
  process.exit(0);
});

async function forwardToolCall(message) {
  const { id, params } = message;
  if (waitingToolCalls.has(id)) {
    sendError(id, -32600, "Tool call ID already waiting for connection");
    return;
  }
  waitingToolCalls.set(id, message);
  let connectionError;
  try {
    await affinity.connect();
  } catch (error) {
    connectionError = error;
  }
  // A cancelled waiter owns neither a response nor any later use of its ID.
  if (waitingToolCalls.get(id) !== message) return;
  waitingToolCalls.delete(id);
  if (connectionError) throw connectionError;
  sendResult(id, await affinity.request("tools/call", { name: params.name, arguments: params.arguments ?? {} }));
}

async function handleMessage(message) {
  try {
    switch (message.method) {
      case "initialize":
        if (typeof message.params?.protocolVersion !== "string") {
          sendError(message.id, -32602, "protocolVersion must be a string");
          break;
        }
        sendResult(message.id, {
          protocolVersion: CLIENT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "affinity-mcp", version: "0.5.5-dev.3" },
          instructions:
            "Use Affinity by Canva through its local MCP server. Read read_sdk_documentation_topic with filename 'preamble' before writing or executing scripts.",
        });
        break;

      case "ping":
        sendResult(message.id, {});
        break;

      case "tools/list": {
        const params = message.params ?? {};
        if (Object.hasOwn(params, "cursor") && typeof params.cursor !== "string") {
          sendError(message.id, -32602, "cursor must be a string");
          break;
        }
        try {
          sendResult(message.id, await affinity.listTools(params));
        } catch (err) {
          if (Object.hasOwn(params, "cursor")) throw err;
          console.error(`Affinity discovery unavailable; using fallback tools: ${err.message}`);
          sendResult(message.id, { tools: STATIC_TOOLS });
        }
        break;
      }

      case "tools/call":
        if (!isObject(message.params) || typeof message.params.name !== "string" ||
            (Object.hasOwn(message.params, "arguments") && !isObject(message.params.arguments))) {
          sendError(message.id, -32602, "tools/call requires a string name and object arguments");
          break;
        }
        await forwardToolCall(message);
        break;

      case "resources/list":
        sendResult(message.id, { resources: [] });
        break;

      case "prompts/list":
        sendResult(message.id, { prompts: [] });
        break;

      default:
        sendError(message.id, -32601, `Unsupported method: ${message.method}`);
    }
  } catch (err) {
    sendError(
      message.id,
      -32603,
      `Affinity MCP proxy error: ${err.message}`,
      err.data,
    );
  }
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data && { data }) } });
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  if (framedStdio) process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
  if (!framedStdio) process.stdout.write("\n");
}
