const MAX_RESPONSE_BYTES = 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function getConfig(env) {
  if (!env.REMOTE_RUNTIME_URL) throw Object.assign(new Error("Remote runtime is not configured"), { code: "remote_runtime_not_configured", status: 503 });
  let base;
  try { base = new URL(env.REMOTE_RUNTIME_URL); }
  catch { throw Object.assign(new Error("REMOTE_RUNTIME_URL is invalid"), { code: "invalid_remote_runtime_url", status: 500 }); }
  if ((base.protocol !== "https:" && !(base.protocol === "http:" && LOOPBACK_HOSTS.has(base.hostname))) || base.username || base.password || base.hash) {
    throw Object.assign(new Error("Remote runtime must use HTTPS except on localhost and cannot contain URL credentials or fragments"), { code: "unsafe_remote_runtime_url", status: 500 });
  }
  base.search = "";
  base.pathname = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  return { base, token: env.REMOTE_RUNTIME_TOKEN || "" };
}

function safeSessionUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw Object.assign(new Error("Remote runtime returned an invalid session URL"), { code: "invalid_remote_session_url", status: 502 }); }
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) || url.username || url.password) {
    throw Object.assign(new Error("Remote runtime returned an unsafe session URL"), { code: "unsafe_remote_session_url", status: 502 });
  }
  return url.toString();
}

export function createRemoteRuntime({ env = process.env, fetchImpl = fetch, timeoutMs = 20_000 } = {}) {
  const { base, token } = getConfig(env);
  async function request(path, { method = "GET", body, allowNotFound = false } = {}) {
    const url = new URL(path, base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(timeoutMs, 45_000)));
    const headers = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    try {
      const response = await fetchImpl(url, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal, redirect: "error"
      });
      if (allowNotFound && response.status === 404) return null;
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
        throw Object.assign(new Error("Remote runtime response exceeded the size limit"), { code: "remote_response_too_large", status: 502 });
      }
      if (!response.ok) throw Object.assign(new Error(`Remote runtime returned HTTP ${response.status}`), { code: "remote_runtime_request_failed", status: 502 });
      if (!text.trim()) return {};
      try { return JSON.parse(text); }
      catch { throw Object.assign(new Error("Remote runtime returned invalid JSON"), { code: "invalid_remote_runtime_response", status: 502 }); }
    } catch (error) {
      if (error.name === "AbortError") throw Object.assign(new Error("Remote runtime request timed out"), { code: "remote_runtime_timeout", status: 504 });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function capabilities() {
    const result = await request("v1/capabilities");
    if (!Array.isArray(result.apps)) {
      throw Object.assign(new Error("Remote runtime capabilities must include an apps array"), { code: "invalid_remote_capabilities", status: 502 });
    }
    return {
      provider: result.provider || "Configured remote runtime",
      apps: result.apps.filter((app) => app && typeof app.id === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(app.id)).map((app) => ({
        id: app.id,
        name: String(app.name || app.id).slice(0, 120),
        description: String(app.description || "").slice(0, 500)
      }))
    };
  }

  async function createSession(appId) {
    if (typeof appId !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(appId)) {
      throw Object.assign(new Error("Remote app id is invalid"), { code: "invalid_remote_app_id", status: 400 });
    }
    const result = await request("v1/sessions", { method: "POST", body: { appId, client: "everything-platform", version: "0.10.0" } });
    if (!result || typeof result.id !== "string" || result.id.length > 200 || typeof result.url !== "string") {
      throw Object.assign(new Error("Remote runtime returned an invalid session"), { code: "invalid_remote_session", status: 502 });
    }
    return { id: result.id, appId, url: safeSessionUrl(result.url), expiresAt: result.expiresAt || null };
  }

  async function deleteSession(sessionId) {
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(sessionId)) {
      throw Object.assign(new Error("Remote session id is invalid"), { code: "invalid_remote_session_id", status: 400 });
    }
    await request(`v1/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    return { deleted: true, id: sessionId };
  }

  return { capabilities, createSession, deleteSession };
}
