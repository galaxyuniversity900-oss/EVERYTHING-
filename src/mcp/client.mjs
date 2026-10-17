const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_ARGUMENT_BYTES = 16 * 1024;

function configuredUrl(env) {
  if (!env.MCP_SERVER_URL) throw Object.assign(new Error("MCP server is not configured"), { code: "mcp_not_configured", status: 503 });
  let url;
  try { url = new URL(env.MCP_SERVER_URL); } catch {
    throw Object.assign(new Error("MCP_SERVER_URL is invalid"), { code: "invalid_mcp_url", status: 500 });
  }
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.hash) {
    throw Object.assign(new Error("MCP URL must use HTTPS (HTTP is allowed only for localhost) and cannot include credentials or fragments"), { code: "unsafe_mcp_url", status: 500 });
  }
  return url;
}

function parseEvent(event) {
  const data = event.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
  if (!data || data === "[DONE]") return null;
  try { return JSON.parse(data); } catch { return null; }
}

async function readSseResponse(response, id) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let totalBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw Object.assign(new Error("MCP response exceeded the size limit"), { code: "mcp_response_too_large", status: 502 });
      }
      buffer += decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
        const delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0];
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + delimiter.length);
        const parsed = parseEvent(event);
        if (parsed && parsed.id === id) {
          await reader.cancel();
          return parsed;
        }
      }
    }
    const tail = parseEvent(buffer);
    return tail && tail.id === id ? tail : null;
  } finally {
    reader.releaseLock();
  }
}

async function readRpcResponse(response, id) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) return readSseResponse(response, id);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw Object.assign(new Error("MCP response exceeded the size limit"), { code: "mcp_response_too_large", status: 502 });
  }
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    if (id !== undefined && parsed?.id !== id) {
      throw Object.assign(new Error("MCP server returned a response with an unexpected request id"), { code: "mcp_response_id_mismatch", status: 502 });
    }
    return parsed;
  } catch (error) {
    if (error.code === "mcp_response_id_mismatch") throw error;
    throw Object.assign(new Error("MCP server returned an unreadable response"), { code: "invalid_mcp_response", status: 502 });
  }
}

export function createMcpClient({ env = process.env, fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const endpoint = configuredUrl(env);
  const token = env.MCP_ACCESS_TOKEN || "";

  async function post(payload, sessionId) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs, 30_000)));
    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-03-26"
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (sessionId) headers["mcp-session-id"] = sessionId;
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal, redirect: "error"
      });
      if (response.status === 202 && !payload.id) return { response, result: null };
      if (!response.ok) {
        throw Object.assign(new Error(`MCP server returned HTTP ${response.status}`), { code: "mcp_request_failed", status: 502 });
      }
      const parsed = await readRpcResponse(response, payload.id);
      if (parsed?.error) {
        throw Object.assign(new Error(parsed.error.message || "MCP JSON-RPC request failed"), { code: "mcp_rpc_error", status: 502 });
      }
      return { response, result: parsed?.result ?? null };
    } catch (error) {
      if (error.name === "AbortError") throw Object.assign(new Error("MCP server request timed out"), { code: "mcp_timeout", status: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function initialize() {
    const { response, result } = await post({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "everything-platform", version: "0.3.0" }
      }
    });
    if (!result || typeof result !== "object") {
      throw Object.assign(new Error("MCP initialization returned no result"), { code: "mcp_initialization_failed", status: 502 });
    }
    const sessionId = response.headers.get("mcp-session-id") || undefined;
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
    return { sessionId, serverInfo: result.serverInfo || null, protocolVersion: result.protocolVersion || null };
  }

  async function listTools() {
    const session = await initialize();
    const { result } = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, session.sessionId);
    if (!Array.isArray(result?.tools)) {
      throw Object.assign(new Error("MCP server did not return a tools list"), { code: "invalid_mcp_tools", status: 502 });
    }
    return { server: session.serverInfo, protocolVersion: session.protocolVersion, tools: result.tools.map((tool) => ({
      name: String(tool.name || ""),
      description: String(tool.description || ""),
      inputSchema: tool.inputSchema || { type: "object" }
    })).filter((tool) => tool.name) };
  }

  async function callTool(name, args = {}) {
    if (typeof name !== "string" || !/^[a-zA-Z0-9_.-]{1,128}$/.test(name)) {
      throw Object.assign(new Error("Tool name is invalid"), { code: "invalid_tool_name", status: 400 });
    }
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw Object.assign(new Error("Tool arguments must be a JSON object"), { code: "invalid_tool_arguments", status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(args), "utf8") > MAX_ARGUMENT_BYTES) {
      throw Object.assign(new Error("Tool arguments exceed the size limit"), { code: "tool_arguments_too_large", status: 413 });
    }
    const session = await initialize();
    const { result } = await post({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name, arguments: args }
    }, session.sessionId);
    return result;
  }

  return { listTools, callTool };
}
