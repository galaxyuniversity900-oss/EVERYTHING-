import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, apps } from "./src/registry.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number.parseInt(process.env.PORT || "8787", 10);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": contentTypes[".json"], "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    return sendJson(res, 405, { error: "method_not_allowed" });
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok", service: "everything-platform", version: "0.1.0" });
  }

  if (url.pathname === "/api/apps") {
    const category = url.searchParams.get("category") || "All";
    const query = url.searchParams.get("q") || "";
    const results = getApps({ query, category });
    return sendJson(res, 200, { count: results.length, categories: ["All", ...new Set(apps.map((app) => app.category))], apps: results });
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
    res.writeHead(200, { "content-type": type, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
    return res.end(req.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return sendJson(res, 404, { error: "not_found" });
    return sendJson(res, 500, { error: "internal_error" });
  }
});

server.listen(port, host, () => {
  console.log(`EVERYTHING- running at http://${host}:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
