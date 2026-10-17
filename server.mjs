import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, apps } from "./src/registry.mjs";
import { routeAIChat } from "./src/ai/router.mjs";
import { publicAIProviderRegistry } from "./src/ai/provider-registry.mjs";
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
    if (originUrl.host !== requestUrl.host || !originHostAllowed || (isTrustedPublic && originUrl.protocol !== "https:")) {
      sendJson(res, 403, { error: { code: "origin_not_allowed", message: "Cross-origin requests are not allowed." } });
      return false;
    }
    return true;
  } catch {
    sendJson(res, 403, { error: { code: "origin_not_allowed", message: "Invalid request origin." } });
    return false;
  }
}

