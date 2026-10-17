import test from "node:test";
import assert from "node:assert/strict";
import { createMcpClient } from "../src/mcp/client.mjs";

test("MCP client requires an explicitly configured server URL", () => {
  assert.throws(() => createMcpClient({ env: {} }), (error) => error.code === "mcp_not_configured");
});

test("MCP client rejects cleartext non-local URLs", () => {
  assert.throws(() => createMcpClient({ env: { MCP_SERVER_URL: "http://example.com/mcp" } }), (error) => error.code === "unsafe_mcp_url");
});

test("MCP client rejects URL-embedded credentials", () => {
  assert.throws(() => createMcpClient({ env: { MCP_SERVER_URL: "https://user:pass@example.com/mcp" } }), (error) => error.code === "unsafe_mcp_url");
});

test("MCP tool names and argument types are validated before network calls", async () => {
  const client = createMcpClient({ env: { MCP_SERVER_URL: "https://mcp.example.test/mcp" }, fetchImpl: async () => { throw new Error("should not fetch"); } });
  await assert.rejects(client.callTool("bad tool", {}), (error) => error.code === "invalid_tool_name");
  await assert.rejects(client.callTool("valid_tool", []), (error) => error.code === "invalid_tool_arguments");
});

test("MCP client performs initialize, initialized notification, and tools/list", async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    requests.push(payload.method);
    if (payload.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "test-mcp", version: "1" } } }), {
        status: 200, headers: { "content-type": "application/json", "mcp-session-id": "session-test" }
      });
    }
    if (payload.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (payload.method === "tools/list") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "echo", description: "Echo text", inputSchema: { type: "object" } }] } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    throw new Error("unexpected method");
  };
  const client = createMcpClient({ env: { MCP_SERVER_URL: "https://mcp.example.test/mcp" }, fetchImpl });
  const result = await client.listTools();
  assert.deepEqual(requests, ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(result.server.name, "test-mcp");
  assert.equal(result.tools[0].name, "echo");
});

test("MCP client reads the matching JSON-RPC response from an SSE stream", async () => {
  const fetchImpl = async (_url, options) => {
    const payload = JSON.parse(options.body);
    if (payload.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "sse-mcp" } } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
    if (payload.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (payload.method === "tools/list") {
      const event = `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: [{ name: "from_sse" }] } })}\n\n`;
      return new Response(event, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    throw new Error("unexpected method");
  };
  const client = createMcpClient({ env: { MCP_SERVER_URL: "https://mcp.example.test/mcp" }, fetchImpl });
  const result = await client.listTools();
  assert.equal(result.tools[0].name, "from_sse");
});
