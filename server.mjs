import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, apps } from "./src/registry.mjs";
import { createChatCompletion } from "./src/ai/openai-compatible.mjs";
import { assessCapabilities } from "./src/runtime/capabilities.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8787", 10);
const aiEnabled = process.env.AI_API_ENABLED === "true";
const aiConfigured = aiEnabled && Boolean(process.env.OPENAI_API_KEY);
const aiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
const aiBaseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const MAX_BODY_BYTES = 48 * 1024;
const rateBuckets = new Map();
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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

function aiRateLimit(req) {
  const key = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowMs = 60_000;
  const current = rateBuckets.get(key);
  if (!current || now - current.start >= windowMs) {
    rateBuckets.set(key, { start: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 12;
}

function sameOriginIfProvided(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const expected = new URL(`http://${req.headers.host || "localhost"}`).host;
    if (new URL(origin).host !== expected) {
      sendJson(res, 403, { error: { code: "origin_not_allowed", message: "Cross-origin requests are not allowed." } });
      return false;
    }
    return true;
  } catch {
    sendJson(res, 403, { error: { code: "origin_not_allowed", message: "Invalid request origin." } });
    return false;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" || req.method === "HEAD") {
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok", service: "everything-platform", version: "0.2.0" });
    }

    if (url.pathname === "/api/apps") {
      const category = url.searchParams.get("category") || "All";
      const query = url.searchParams.get("q") || "";
      const results = getApps({ query, category });
      return sendJson(res, 200, { count: results.length, categories: ["All", ...new Set(apps.map((app) => app.category))], apps: results });
    }

    if (url.pathname === "/api/ai/providers") {
      return sendJson(res, 200, {
        providers: [{ id: "openai-compatible", name: "OpenAI-compatible API", configured: aiConfigured, model: aiConfigured ? aiModel : null }],
        enabled: aiConfigured,
        setup: aiConfigured ? null : "Set AI_API_ENABLED=true and OPENAI_API_KEY on the server. Never put the key in browser code."
      });
    }

    if (url.pathname === "/api/runtime/capabilities") {
      const capabilities = assessCapabilities({
        wasm: url.searchParams.get("wasm") === "1",
        webgpu: url.searchParams.get("webgpu") === "1",
        network: url.searchParams.get("network") !== "0",
        remoteAvailable: false
      });
      return sendJson(res, 200, { ...capabilities, remoteExecutionImplemented: false });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return sendJson(res, 400, { error: "invalid_path" });
    }
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

  if (req.method === "POST" && url.pathname === "/api/ai/chat") {
    if (!sameOriginIfProvided(req, res)) return;
    if (!aiConfigured) {
      return sendJson(res, 503, { error: { code: "ai_not_configured", message: "AI is disabled. Configure it explicitly on the server first." } });
    }
    if (!aiRateLimit(req)) {
      return sendJson(res, 429, { error: { code: "rate_limited", message: "Too many AI requests. Wait a minute and try again." } });
    }
    if (!req.headers["content-type"]?.includes("application/json")) {
      return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
    }
    try {
      const body = await readJsonBody(req);
      const result = await createChatCompletion({
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: aiBaseUrl,
        model: aiModel,
        messages: body.messages
      });
      return sendJson(res, 200, result);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 502;
      return sendJson(res, status, { error: { code: error.code || "ai_request_failed", message: error.message || "AI request failed." } });
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
