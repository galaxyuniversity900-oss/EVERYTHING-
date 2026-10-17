import { readBoundedResponseText } from "../utils/read-bounded-response.mjs";
const MAX_TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const isInternalServiceHost = (hostname) => /^[a-zA-Z][a-zA-Z0-9-]{0,62}$/.test(hostname) && !LOOPBACK_HOSTS.has(hostname);

export async function createChatCompletion({
  apiKey,
  baseUrl = "https://api.openai.com/v1",
  model,
  messages,
  fetchImpl = fetch,
  timeoutMs = 60_000,
  allowInternalHttp = false
}) {
  let base;
  try { base = new URL(baseUrl); }
  catch { throw Object.assign(new Error("AI base URL is invalid"), { code: "invalid_provider_url", status: 500 }); }
  const local = LOOPBACK_HOSTS.has(base.hostname);
  const internalHttp = allowInternalHttp && base.protocol === "http:" && isInternalServiceHost(base.hostname);
  if (base.username || base.password || base.hash || base.search) {
    throw Object.assign(new Error("AI provider URL cannot contain credentials, query parameters, or fragments"), { code: "unsafe_provider_url", status: 500 });
  }
  if (base.protocol !== "https:" && !(local && base.protocol === "http:") && !internalHttp) {
    throw Object.assign(new Error("AI provider URL must use HTTPS outside localhost"), { code: "insecure_provider_url", status: 500 });
  }
  if (!apiKey && !local && !internalHttp) throw Object.assign(new Error("A provider API key is required for non-local endpoints"), { code: "provider_not_configured", status: 503 });
  if (!model || typeof model !== "string") throw Object.assign(new Error("AI model is not configured"), { code: "model_not_configured", status: 503 });
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) {
    throw Object.assign(new Error("messages must contain between 1 and 40 items"), { code: "invalid_messages", status: 400 });
  }
  const safeMessages = messages.map((message) => {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw Object.assign(new Error("Each message needs an allowed role and string content"), { code: "invalid_messages", status: 400 });
    }
    if (message.content.length > 20_000) throw Object.assign(new Error("A message exceeds the 20000 character limit"), { code: "message_too_large", status: 413 });
    return { role: message.role, content: message.content };
  });
  const endpoint = new URL("chat/completions", base.href.endsWith("/") ? base : new URL(base.href + "/"));
  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(Number(timeoutMs) || 60_000, MAX_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const headers = { "content-type": "application/json", accept: "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await fetchImpl(endpoint, {
      method: "POST", headers,
      body: JSON.stringify({ model, messages: safeMessages, stream: false }),
      signal: controller.signal, redirect: "error"
    });
    const responseText = await readBoundedResponseText(response, {
      maxBytes: MAX_RESPONSE_BYTES,
      message: "AI provider response exceeded the size limit",
      code: "provider_response_too_large"
    });
    let payload = {};
    try { payload = responseText ? JSON.parse(responseText) : {}; } catch { /* Handle non-JSON provider errors below. */ }
    if (!response.ok) {
      throw Object.assign(new Error(payload?.error?.message || `AI provider returned HTTP ${response.status}`), { code: "provider_request_failed", status: 502 });
    }
    if (!responseText || !Object.keys(payload).length) {
      throw Object.assign(new Error("AI provider returned invalid JSON"), { code: "invalid_provider_response", status: 502 });
    }
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw Object.assign(new Error("AI provider returned an unexpected response"), { code: "invalid_provider_response", status: 502 });
    }
    return { content, model: payload.model || model, usage: payload.usage || null };
  } catch (error) {
    if (error.name === "AbortError") throw Object.assign(new Error("AI provider request timed out"), { code: "provider_timeout", status: 504 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
