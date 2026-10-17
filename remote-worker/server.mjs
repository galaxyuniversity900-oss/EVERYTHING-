import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, timingSafeEqual } from "node:crypto";

const execFileDefault = promisify(execFileCallback);
const MAX_BODY_BYTES = 16 * 1024;
const MAX_API_RESPONSE_BYTES = 256 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ALLOWED_CAPABILITIES = new Set(["CHOWN", "DAC_OVERRIDE", "FOWNER", "FSETID", "KILL", "SETGID", "SETUID", "SETPCAP", "NET_BIND_SERVICE", "SYS_CHROOT", "MKNOD", "AUDIT_WRITE"]);

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function parseBase(value, name, allowLoopbackHttp = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  const local = allowLoopbackHttp && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error(`${name} must be HTTPS (HTTP only for loopback) and cannot include credentials, paths, queries, or fragments`);
  }
  url.pathname = "/";
  return url;
}

function readWorkerConfig(env) {
  const token = env.WORKER_TOKEN || "";
  if (Buffer.byteLength(token, "utf8") < 32) throw new Error("WORKER_TOKEN must contain at least 32 bytes");
  const publicBase = parseBase(env.WORKER_PUBLIC_BASE_URL || "", "WORKER_PUBLIC_BASE_URL", true);
  const sessionBase = parseBase(env.WORKER_SESSION_BASE_URL || "", "WORKER_SESSION_BASE_URL");
  let rawApps;
  try { rawApps = JSON.parse(env.WORKER_APPS_JSON || "[]"); }
  catch { throw new Error("WORKER_APPS_JSON must be valid JSON"); }
  if (!Array.isArray(rawApps) || rawApps.length > 20) throw new Error("WORKER_APPS_JSON must be an array of at most 20 apps");
  const seen = new Set();
  const apps = rawApps.map((app) => {
    if (!app || typeof app !== "object" || Array.isArray(app)) throw new Error("Each worker app must be an object");
    if (typeof app.id !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(app.id) || seen.has(app.id)) throw new Error("Worker app ids must be unique safe identifiers");
    if (typeof app.image !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,255}$/.test(app.image)) throw new Error(`App ${app.id} has an invalid container image reference`);
    const port = Number(app.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`App ${app.id} has an invalid container port`);
    const memoryInput = typeof app.memory === "string" ? app.memory : "2g";
    const memoryMatch = /^(\d+)(m|g)$/.exec(memoryInput);
    const memoryMiB = memoryMatch ? Number(memoryMatch[1]) * (memoryMatch[2] === "g" ? 1024 : 1) : 0;
    if (!Number.isSafeInteger(memoryMiB) || memoryMiB < 128 || memoryMiB > 16 * 1024) throw new Error(`App ${app.id} memory must be between 128m and 16g`);
    const memory = memoryInput;
    const cpus = Number.isFinite(Number(app.cpus)) ? Math.max(0.25, Math.min(4, Number(app.cpus))) : 1;
    const pids = Number.isInteger(Number(app.pids)) ? Math.max(64, Math.min(512, Number(app.pids))) : 256;
    const envEntries = Object.entries(app.env || {});
    if (envEntries.length > 30 || envEntries.some(([key, value]) => !/^[A-Z_][A-Z0-9_]{0,63}$/.test(key) || typeof value !== "string" || value.length > 512 || /[\u0000\r\n]/.test(value))) {
      throw new Error(`App ${app.id} has invalid environment settings`);
    }
    const capabilities = Array.isArray(app.capabilities) ? app.capabilities : [];
    if (capabilities.length > 12 || capabilities.some((capability) => typeof capability !== "string" || !ALLOWED_CAPABILITIES.has(capability))) {
      throw new Error(`App ${app.id} requests an unsupported Linux capability`);
    }
    seen.add(app.id);
    return {
      id: app.id,
      name: String(app.name || app.id).slice(0, 120),
      description: String(app.description || "").slice(0, 500),
      image: app.image,
      port,
      memory,
      cpus,
      pids,
      capabilities,
      env: Object.fromEntries(envEntries)
    };
  });
  const integerSetting = (key, fallback, min, max) => {
    const parsed = Number.parseInt(env[key] || String(fallback), 10);
    return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  };
  const host = env.WORKER_HOST || "127.0.0.1";
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("WORKER_HOST must be loopback; expose the worker through a reverse proxy");
  return {
    token,
    publicBase,
    sessionBase,
    apps,
    host,
    port: integerSetting("WORKER_PORT", 8788, 0, 65535),
    maxSessions: integerSetting("WORKER_MAX_SESSIONS", 3, 1, 20),
    ttlMs: integerSetting("WORKER_SESSION_TTL_MINUTES", 60, 5, 1440) * 60_000,
    idleMs: integerSetting("WORKER_IDLE_TIMEOUT_MINUTES", 15, 1, 240) * 60_000
  };
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left || "", "utf8");
  const b = Buffer.from(right || "", "utf8");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  if (Buffer.byteLength(body, "utf8") > MAX_API_RESPONSE_BYTES) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify({ error: { code: "response_too_large", message: "Response exceeded the size limit." } }));
    return;
  }
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  res.end(body);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError(413, "body_too_large", "Request body is too large");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw httpError(400, "invalid_json", "Request body must be valid JSON"); }
}

function forwardedHttps(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(hostname);
}

export function createRemoteWorker({ env = process.env, execFileImpl = execFileDefault, now = () => Date.now(), randomBytesImpl = randomBytes } = {}) {
  const config = readWorkerConfig(env);
  const appsById = new Map(config.apps.map((app) => [app.id, app]));
  const sessions = new Map();

  async function docker(args) {
    try {
      return await execFileImpl("docker", args, { timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
    } catch (error) {
      throw httpError(502, "container_runtime_error", "The container runtime could not complete the requested operation");
    }
  }

  function authorized(req) {
    const header = req.headers.authorization || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return Boolean(match && constantTimeEqual(match[1], config.token));
  }

  function hostInfo(req) {
    try {
      const url = new URL(`http://${req.headers.host || "localhost"}`);
      return { hostname: url.hostname.toLowerCase(), host: url.host.toLowerCase() };
    } catch { return null; }
  }

  function apiHostAllowed(req, host) {
    if (isLoopbackHost(host.hostname)) return true;
    return host.hostname === config.publicBase.hostname.toLowerCase() && forwardedHttps(req);
  }

  function sessionLabelFromHost(hostname) {
    const suffix = `.${config.sessionBase.hostname.toLowerCase()}`;
    if (!hostname.endsWith(suffix)) return null;
    const label = hostname.slice(0, -suffix.length);
    const match = /^([a-f0-9]{16})-([a-f0-9]{32})$/.exec(label);
    return match ? { id: match[1], viewToken: match[2] } : null;
  }

  function sessionFromRequest(req) {
    const host = hostInfo(req);
    if (!host) return null;
    const label = sessionLabelFromHost(host.hostname);
    if (!label) return null;
    const session = sessions.get(label.id);
    if (!session || !constantTimeEqual(label.viewToken, session.viewToken)) return null;
    if (session.expiresAt <= now() || session.lastActivity + config.idleMs <= now()) {
      void stopSession(session.id);
      return null;
    }
    return session;
  }

  async function stopSession(id) {
    const session = sessions.get(id);
    if (!session) return false;
    sessions.delete(id);
    try { await docker(["rm", "-f", session.containerName]); } catch { /* Container may already have exited. */ }
    return true;
  }

  function buildSessionUrl(id, viewToken) {
    const url = new URL(config.sessionBase.toString());
    url.hostname = `${id}-${viewToken}.${config.sessionBase.hostname}`;
    url.pathname = "/";
    return url.toString();
  }

  async function createSession(appId) {
    const app = appsById.get(appId);
    if (!app) throw httpError(400, "app_not_supported", "This worker does not advertise that app id");
    if (sessions.size >= config.maxSessions) throw httpError(429, "session_capacity_reached", "All remote sessions are in use; try again later");
    const id = randomBytesImpl(8).toString("hex");
    const viewToken = randomBytesImpl(16).toString("hex");
    const containerName = `everything-${id}`;
    const args = [
      "run", "-d", "--rm",
      "--name", containerName,
      "--label", "com.everything.managed=true",
      "--label", `com.everything.session=${id}`,
      "--memory", app.memory,
      "--memory-swap", app.memory,
      "--cpus", String(app.cpus),
      "--pids-limit", String(app.pids),
      "--security-opt", "no-new-privileges:true",
      "--cap-drop", "ALL",
      "--shm-size", "256m",
      "--publish", `127.0.0.1::${app.port}/tcp`,
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"
    ];
    for (const capability of app.capabilities) args.push("--cap-add", capability);
    for (const [key, value] of Object.entries(app.env)) args.push("--env", `${key}=${value}`);
    args.push(app.image);
    let started = false;
    try {
      const result = await docker(args);
      if (!String(result.stdout || "").trim()) throw httpError(502, "container_start_failed", "The container runtime did not return a container id");
      started = true;
      const portResult = await docker(["port", containerName, `${app.port}/tcp`]);
      const match = /127\.0\.0\.1:(\d+)/.exec(String(portResult.stdout || ""));
      if (!match) throw httpError(502, "container_port_unavailable", "The container did not expose its configured port on loopback");
      const createdAt = now();
      const session = {
        id, appId, containerName, hostPort: Number(match[1]), viewToken,
        createdAt, lastActivity: createdAt, expiresAt: createdAt + config.ttlMs,
        url: buildSessionUrl(id, viewToken)
      };
      sessions.set(id, session);
      return { id, appId, url: session.url, expiresAt: new Date(session.expiresAt).toISOString() };
    } catch (error) {
      if (started) {
        try { await docker(["rm", "-f", containerName]); } catch { /* Best-effort rollback. */ }
      }
      throw error;
    }
  }

  function rewriteLocation(value, session) {
    if (typeof value !== "string") return value;
    try {
      const target = new URL(value);
      if (["127.0.0.1", "localhost"].includes(target.hostname) && Number(target.port) === session.hostPort) {
        const publicUrl = new URL(session.url);
        target.protocol = publicUrl.protocol;
        target.host = publicUrl.host;
        return target.toString();
      }
    } catch { /* Keep relative locations unchanged. */ }
    return value;
  }

  async function proxyHttp(req, res, session) {
    session.lastActivity = now();
    const originalHost = req.headers.host || "";
    const headers = { ...req.headers, host: `127.0.0.1:${session.hostPort}`, "x-forwarded-host": originalHost, "x-forwarded-proto": "https", connection: "close" };
    delete headers["proxy-authorization"];
    const upstream = httpRequest({
      hostname: "127.0.0.1",
      port: session.hostPort,
      method: req.method,
      path: req.url || "/",
      headers
    }, (upstreamResponse) => {
      const responseHeaders = { ...upstreamResponse.headers };
      responseHeaders["cache-control"] = "no-store";
      responseHeaders["referrer-policy"] = "no-referrer";
      responseHeaders["x-content-type-options"] = "nosniff";
      if (responseHeaders.location) responseHeaders.location = rewriteLocation(responseHeaders.location, session);
      res.writeHead(upstreamResponse.statusCode || 502, responseHeaders);
      upstreamResponse.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) sendJson(res, 502, { error: { code: "session_unavailable", message: "The remote application session is unavailable." } });
      else res.destroy();
    });
    req.on("aborted", () => upstream.destroy());
    req.pipe(upstream);
  }

  function handleUpgrade(req, socket, head) {
    const session = sessionFromRequest(req);
    if (!session || !forwardedHttps(req)) {
      socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      return;
    }
    session.lastActivity = now();
    const headers = { ...req.headers, host: `127.0.0.1:${session.hostPort}`, "x-forwarded-host": req.headers.host || "", "x-forwarded-proto": "https" };
    const upstream = httpRequest({
      hostname: "127.0.0.1", port: session.hostPort, method: req.method, path: req.url || "/", headers
    });
    upstream.on("upgrade", (response, upstreamSocket, upstreamHead) => {
      const statusLine = `HTTP/1.1 ${response.statusCode || 101} ${response.statusMessage || "Switching Protocols"}\r\n`;
      const lines = [];
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const item of value) lines.push(`${key}: ${item}\r\n`);
        else if (value !== undefined) lines.push(`${key}: ${value}\r\n`);
      }
      socket.write(statusLine + lines.join("") + "\r\n");
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) socket.write(upstreamHead);
      socket.pipe(upstreamSocket);
      upstreamSocket.pipe(socket);
    });
    upstream.on("response", (response) => {
      socket.end(`HTTP/1.1 ${response.statusCode || 502} ${response.statusMessage || "Bad Gateway"}\r\nConnection: close\r\n\r\n`);
    });
    upstream.on("error", () => socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"));
    upstream.end();
  }

  async function handle(req, res) {
    const host = hostInfo(req);
    if (!host) return sendJson(res, 400, { error: { code: "invalid_host", message: "Invalid request host." } });
    const sessionLabel = sessionLabelFromHost(host.hostname);
    if (sessionLabel) {
      const session = sessionFromRequest(req);
      if (!session || !forwardedHttps(req)) return sendJson(res, 404, { error: { code: "session_not_found", message: "Remote session was not found or has expired." } });
      return proxyHttp(req, res, session);
    }
    if (!apiHostAllowed(req, host)) return sendJson(res, 403, { error: { code: "untrusted_host", message: "Worker host is not trusted." } });

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      return sendJson(res, 200, { status: "ok", service: "everything-remote-worker", configuredApps: config.apps.length, activeSessions: sessions.size });
    }

    if (url.pathname.startsWith("/v1/") && !authorized(req)) {
      return sendJson(res, 401, { error: { code: "unauthorized", message: "A valid worker bearer token is required." } });
    }

    if (req.method === "GET" && url.pathname === "/v1/capabilities") {
      return sendJson(res, 200, {
        provider: "EVERYTHING Docker Session Worker",
        apps: config.apps.map(({ id, name, description }) => ({ id, name, description }))
      });
    }

    if (req.method === "POST" && url.pathname === "/v1/sessions") {
      if (!req.headers["content-type"]?.includes("application/json")) return sendJson(res, 415, { error: { code: "json_required", message: "Content-Type must be application/json." } });
      try {
        const body = await readJsonBody(req);
        if (!body || typeof body.appId !== "string") return sendJson(res, 400, { error: { code: "invalid_app_id", message: "appId is required." } });
        const session = await createSession(body.appId);
        return sendJson(res, 201, session);
      } catch (error) {
        return sendJson(res, error.status || 502, { error: { code: error.code || "session_create_failed", message: error.status ? error.message : "The container session could not be created." } });
      }
    }

    const deleteMatch = /^\/v1\/sessions\/([a-f0-9]{16})$/.exec(url.pathname);
    if (req.method === "DELETE" && deleteMatch) {
      const deleted = await stopSession(deleteMatch[1]);
      if (!deleted) return sendJson(res, 404, { error: { code: "session_not_found", message: "Remote session was not found." } });
      return sendJson(res, 200, { deleted: true, id: deleteMatch[1] });
    }

    return sendJson(res, 404, { error: { code: "not_found", message: "Worker route not found." } });
  }

  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, error.status || 500, { error: { code: error.code || "worker_error", message: error.status ? error.message : "Remote worker request failed." } });
      else res.destroy();
    });
  });
  server.on("upgrade", handleUpgrade);

  async function cleanupManagedContainers() {
    const result = await docker(["ps", "-aq", "--filter", "label=com.everything.managed=true"]);
    const ids = String(result.stdout || "").split(/\s+/).filter((id) => /^[a-f0-9]{12,64}$/.test(id));
    if (ids.length) await docker(["rm", "-f", ...ids]);
  }

  async function close() {
    clearInterval(cleanupTimer);
    await Promise.all([...sessions.keys()].map((id) => stopSession(id)));
    await new Promise((resolve) => server.close(() => resolve()));
  }

  const cleanupTimer = setInterval(() => {
    const timestamp = now();
    for (const session of sessions.values()) {
      if (session.expiresAt <= timestamp || session.lastActivity + config.idleMs <= timestamp) void stopSession(session.id);
    }
  }, 30_000);
  cleanupTimer.unref();

  return { server, config, sessions, cleanupManagedContainers, close };
}

if (process.argv[1] && process.argv[1].endsWith("remote-worker/server.mjs")) {
  try {
    const worker = createRemoteWorker();
    await worker.cleanupManagedContainers();
    worker.server.listen(worker.config.port, worker.config.host, () => {
      console.log(`EVERYTHING remote worker listening on http://${worker.config.host}:${worker.config.port}`);
    });
    const shutdown = async () => {
      await worker.close();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } catch (error) {
    console.error(`Remote worker configuration/startup failed: ${error.message}`);
    process.exit(1);
  }
}
