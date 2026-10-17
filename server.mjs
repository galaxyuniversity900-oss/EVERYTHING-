import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, apps } from "./src/registry.mjs";
import { routeAIChat } from "./src/ai/router.mjs";
import { getAIProviderRegistry, publicAIProviderRegistry } from "./src/ai/provider-registry.mjs";
import { checkProviderConnection } from "./src/ai/provider-adapters.mjs";
import { assessCapabilities } from "./src/runtime/capabilities.mjs";
import { createMcpClient } from "./src/mcp/client.mjs";
import { createRemoteRuntime } from "./src/runtime/remote-provider.mjs";
import { createAuthManager } from "./src/security/auth.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8787", 10);
const aiStatus = publicAIProviderRegistry();
const aiConfigured = aiStatus.enabled;
const mcpConfigured = Boolean(process.env.MCP_SERVER_URL);
const remoteConfigured = Boolean(process.env.REMOTE_RUNTIME_URL);
const remoteRateBuckets = new Map();
const activeRemoteSessions = new Map();
const authRateBuckets = new Map();
const cookieSecure = process.env.COOKIE_SECURE === "true";
const authManager = createAuthManager({ password: process.env.AUTH_PASSWORD || "", cookieSecure });
const trustedHosts = new Set((process.env.TRUSTED_HOSTS || "").split(",").map((value) => value.trim().toLowerCase()).filter((value) => /^[a-z0-9.-]{1,253}$/.test(value) && !value.startsWith(".") && !value.endsWith(".") && !value.includes("..")));
const MAX_BODY_BYTES = 48 * 1024;
const rateBuckets = new Map();
const mcpRateBuckets = new Map();
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": contentTypes[".json"],
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("Request body is too large"), { status: 413, code: "body_too_large" });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON"), { status: 400, code: "invalid_json" });
  }
}

function rateLimit(req, buckets, limit) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now - current.start >= 60_000) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function sameOriginIfProvided(req, res) {
  const hostHeader = req.headers.host || "localhost";
  try {
    const requestUrl = new URL(`http://${hostHeader}`);
    const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    const isLoopback = loopbackHosts.has(requestUrl.hostname);
    const isTrustedPublic = authManager.enabled && cookieSecure && trustedHosts.has(requestUrl.hostname.toLowerCase());
    if (!isLoopback && !isTrustedPublic) {
      sendJson(res, 403, { error: { code: "unsafe_host", message: "This host is not trusted by the current server configuration." } });
      return false;
    }
    if (isTrustedPublic && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() !== "https") {
      sendJson(res, 403, { error: { code: "https_required", message: "Trusted public hosts must be served through an HTTPS reverse proxy." } });
      return false;
    }
    const origin = req.headers.origin;
    if (!origin) return true;
    const originUrl = new URL(origin);
    const originHostAllowed = loopbackHosts.has(originUrl.hostname) || (authManager.enabled && cookieSecure && trustedHosts.has(originUrl.hostname.toLowerCase()));
    if (originUrl.host !== requestUrl.host || !originHostAllowed || (isLoopback && originUrl.protocol !== "http:") || (isTrustedPublic && originUrl.protocol !== "https:")) {
      sendJson(res, 403, { error: { code: "origin_not_allowed", message: "Cross-origin requests are not allowed." } });
      return false;
    }
    return true;
  } catch {
    sendJson(res, 403, { error: { code: "origin_not_allowed", message: "Invalid request origin." } });
    return false;
  }
}

async function routeError(res, error, fallbackCode) {
  const status = Number.isInteger(error.status) ? error.status : 502;
  return sendJson(res, status, { error: { code: error.code || fallbackCode, message: error.message || "Request failed." } });
}

const server = createServer(async (req, res) => {
  if (!sameOriginIfProvided(req, res)) return;
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/auth/status") {
    const authenticated = authManager.enabled ? authManager.isAuthenticated(req) : true;
    return sendJson(res, 200, { required: authManager.enabled, authenticated });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    if (!authManager.enabled) return sendJson(res, 400, { error: { code: "auth_not_configured", message: "No access password is configured on this server." } });
    if (!rateLimit(req, authRateBuckets, 5)) return sendJson(res, 429, { error: { code: "login_rate_limited", message: "Too many login attempts. Wait a minute and try again." } });
    if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    try {
      const body = await readJsonBody(req);
      if (!body || !authManager.verifyPassword(body.password)) {
        return sendJson(res, 401, { error: { code: "invalid_credentials", message: "The password was not accepted." } });
      }
      const token = authManager.createSession();
      res.setHeader("set-cookie", authManager.cookie(token));
      return sendJson(res, 200, { authenticated: true });
    } catch (error) {
      return routeError(res, error, "login_failed");
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    authManager.destroySession(req);
    res.setHeader("set-cookie", authManager.clearCookie());
    return sendJson(res, 200, { authenticated: !authManager.enabled });
  }

  if (authManager.enabled && url.pathname.startsWith("/api/") && !authManager.isAuthenticated(req)) {
    return sendJson(res, 401, { error: { code: "authentication_required", message: "Sign in to access this API." } });
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok", service: "everything-platform", version: "0.11.0" });
    }
    if (url.pathname === "/api/apps") {
      const results = getApps({ category: url.searchParams.get("category") || "All", query: url.searchParams.get("q") || "" });
      return sendJson(res, 200, { count: results.length, categories: ["All", ...new Set(apps.map((app) => app.category))], apps: results });
    }
    if (url.pathname === "/api/ai/providers") {
      return sendJson(res, 200, {
        ...aiStatus,
        setup: aiConfigured ? null : "Set AI_API_ENABLED=true and configure at least one provider on the server. Never put keys in browser code."
      });
    }
    if (url.pathname === "/api/runtime/capabilities") {
      const result = assessCapabilities({
        wasm: url.searchParams.get("wasm") === "1",
        webgpu: url.searchParams.get("webgpu") === "1",
        network: url.searchParams.get("network") !== "0",
        remoteAvailable: remoteConfigured && url.searchParams.get("network") !== "0"
      });
      return sendJson(res, 200, { ...result, remoteSessionAdapterImplemented: true, remoteRuntimeConfigured: remoteConfigured });
    }
    if (url.pathname === "/api/mcp/status") {
      return sendJson(res, 200, {
        configured: mcpConfigured,
        setup: mcpConfigured ? null : "Set MCP_SERVER_URL on the server. Optional bearer authentication uses MCP_ACCESS_TOKEN."
      });
    }
    if (url.pathname === "/api/runtime/remote/status") {
      return sendJson(res, 200, {
        configured: remoteConfigured,
        setup: remoteConfigured ? null : "Configure REMOTE_RUNTIME_URL and optional REMOTE_RUNTIME_TOKEN on the server."
      });
    }
    if (url.pathname === "/api/runtime/remote/apps") {
      if (!remoteConfigured) return sendJson(res, 503, { error: { code: "remote_runtime_not_configured", message: "Configure REMOTE_RUNTIME_URL on the server first." } });
      try {
        const result = await createRemoteRuntime().capabilities();
        return sendJson(res, 200, result);
      } catch (error) {
        return routeError(res, error, "remote_capabilities_failed");
      }
    }
    if (url.pathname === "/api/mcp/tools") {
      if (!mcpConfigured) return sendJson(res, 503, { error: { code: "mcp_not_configured", message: "Configure MCP_SERVER_URL on the server first." } });
      try {
        const result = await createMcpClient().listTools();
        return sendJson(res, 200, result);
      } catch (error) {
        return routeError(res, error, "mcp_list_failed");
      }
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return sendJson(res, 400, { error: "invalid_path" }); }
    if (pathname === "/") pathname = "/index.html";
    const filePath = path.resolve(publicDir, `.${pathname}`);
    if (!filePath.startsWith(publicDir + path.sep) && filePath !== publicDir) {
      return sendJson(res, 403, { error: "forbidden" });
    }
    try {
      const body = await readFile(filePath);
      const type = contentTypes[path.extname(filePath)] || "application/octet-stream";
      res.writeHead(200, {
        "content-type": type,
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "cache-control": "no-cache"
      });
      return res.end(req.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") return sendJson(res, 404, { error: "not_found" });
      return sendJson(res, 500, { error: "internal_error" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/ai/providers/check") {
    if (!sameOriginIfProvided(req, res)) return;
    if (!aiConfigured) return sendJson(res, 503, { error: { code: "ai_not_configured", message: "AI is disabled. Configure a provider on the server first." } });
    if (!rateLimit(req, rateBuckets, 8)) return sendJson(res, 429, { error: { code: "provider_check_rate_limited", message: "Too many provider checks. Wait a minute and try again." } });
    if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    try {
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") throw Object.assign(new Error("Request must be a JSON object"), { status: 400, code: "invalid_request" });
      const registry = getAIProviderRegistry();
      const providerId = typeof body.providerId === "string" && body.providerId ? body.providerId : registry.defaultProviderId;
      const provider = registry.providers.find((item) => item.id === providerId && item.configured);
      if (!provider) throw Object.assign(new Error("The requested provider is not configured"), { status: 400, code: "unknown_provider" });
      const result = await checkProviderConnection({ provider });
      return sendJson(res, 200, {
        ...result,
        providerId: provider.id,
        providerName: provider.name,
        protocol: provider.protocol || "openai-compatible",
        model: provider.model
      });
    } catch (error) {
      return routeError(res, error, "provider_connection_failed");
    }
  }

  if (req.method === "POST" && url.pathname === "/api/ai/chat") {
    if (!sameOriginIfProvided(req, res)) return;
    if (!aiConfigured) return sendJson(res, 503, { error: { code: "ai_not_configured", message: "AI is disabled. Configure it explicitly on the server first." } });
    if (!rateLimit(req, rateBuckets, 12)) return sendJson(res, 429, { error: { code: "rate_limited", message: "Too many AI requests. Wait a minute and try again." } });
    if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    try {
      const body = await readJsonBody(req);
      if (!body || typeof body !== "object") throw Object.assign(new Error("Request must be a JSON object"), { status: 400, code: "invalid_request" });
      const controller = new AbortController();
      const abortRequest = () => controller.abort();
      const abortDisconnectedResponse = () => { if (!res.writableEnded) controller.abort(); };
      req.once("aborted", abortRequest);
      res.once("close", abortDisconnectedResponse);
      try {
        const result = await routeAIChat({ messages: body.messages, providerId: body.providerId, task: body.task, signal: controller.signal });
        return sendJson(res, 200, result);
      } finally {
        req.off("aborted", abortRequest);
        res.off("close", abortDisconnectedResponse);
      }
    } catch (error) {
      return routeError(res, error, "ai_request_failed");
    }
  }

  if (req.method === "POST" && url.pathname === "/api/mcp/tools/call") {
    if (!sameOriginIfProvided(req, res)) return;
    if (!mcpConfigured) return sendJson(res, 503, { error: { code: "mcp_not_configured", message: "Configure MCP_SERVER_URL on the server first." } });
    if (!rateLimit(req, mcpRateBuckets, 5)) return sendJson(res, 429, { error: { code: "mcp_rate_limited", message: "Too many MCP tool calls. Wait a minute and try again." } });
    if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    try {
      const body = await readJsonBody(req);
      if (!body || body.confirmed !== true) {
        return sendJson(res, 400, { error: { code: "confirmation_required", message: "Review the tool name and arguments, then explicitly confirm before execution." } });
      }
      const controller = new AbortController();
      const abortRequest = () => controller.abort();
      const abortDisconnectedResponse = () => { if (!res.writableEnded) controller.abort(); };
      req.once("aborted", abortRequest);
      res.once("close", abortDisconnectedResponse);
      try {
        const result = await createMcpClient({ signal: controller.signal }).callTool(body.name, body.arguments ?? {});
        return sendJson(res, 200, { result });
      } finally {
        req.off("aborted", abortRequest);
        res.off("close", abortDisconnectedResponse);
      }
    } catch (error) {
      return routeError(res, error, "mcp_tool_call_failed");
    }
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/remote/sessions") {
    if (!sameOriginIfProvided(req, res)) return;
    if (!remoteConfigured) return sendJson(res, 503, { error: { code: "remote_runtime_not_configured", message: "Configure REMOTE_RUNTIME_URL on the server first." } });
    if (!rateLimit(req, remoteRateBuckets, 5)) return sendJson(res, 429, { error: { code: "remote_runtime_rate_limited", message: "Too many session requests. Wait a minute and try again." } });
    if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    try {
      const body = await readJsonBody(req);
      if (!body || body.confirmed !== true) return sendJson(res, 400, { error: { code: "confirmation_required", message: "Explicitly confirm before creating a remote session." } });
      const runtime = createRemoteRuntime();
      const supported = await runtime.capabilities();
      if (!supported.apps.some((app) => app.id === body.appId)) {
        return sendJson(res, 400, { error: { code: "remote_app_not_supported", message: "The configured runtime does not list this app as supported." } });
      }
      const session = await runtime.createSession(body.appId);
      activeRemoteSessions.set(session.id, { appId: session.appId, createdAt: Date.now() });
      return sendJson(res, 201, session);
    } catch (error) {
      return routeError(res, error, "remote_session_create_failed");
    }
  }

  if (req.method === "POST" && url.pathname === "/api/runtime/remote/sessions/close") {
    if (!sameOriginIfProvided(req, res)) return;
    if (!remoteConfigured) return sendJson(res, 503, { error: { code: "remote_runtime_not_configured", message: "Configure REMOTE_RUNTIME_URL on the server first." } });
    if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    try {
      const body = await readJsonBody(req);
      if (!body || body.confirmed !== true) return sendJson(res, 400, { error: { code: "confirmation_required", message: "Explicitly confirm before closing a remote session." } });
      if (!activeRemoteSessions.has(body.id)) return sendJson(res, 404, { error: { code: "remote_session_not_found", message: "This session was not created by this running workspace process." } });
      const result = await createRemoteRuntime().deleteSession(body.id);
      activeRemoteSessions.delete(body.id);
      return sendJson(res, 200, result);
    } catch (error) {
      return routeError(res, error, "remote_session_close_failed");
    }
  }

  res.setHeader("allow", "GET, HEAD, POST");
  return sendJson(res, 405, { error: { code: "method_not_allowed", message: "Method not allowed." } });
});

server.listen(port, host, () => {
  console.log(`EVERYTHING- running at http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
