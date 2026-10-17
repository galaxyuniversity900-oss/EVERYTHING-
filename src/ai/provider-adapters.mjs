import { createChatCompletion } from "./openai-compatible.mjs";

const MAX_TIMEOUT_MS = 90_000;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function nativeProviderBase(baseUrl) {
  let base;
  try { base = new URL(baseUrl); }
  catch { throw Object.assign(new Error("AI provider URL is invalid"), { code: "invalid_provider_url", status: 500 }); }
  if (base.protocol !== "https:" || base.username || base.password || base.hash || base.search) {
    throw Object.assign(new Error("Anthropic and Gemini endpoints must use HTTPS without inline credentials or query parameters"), { code: "unsafe_provider_url", status: 500 });
  }
  base.pathname = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  return base;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 40) {
    throw Object.assign(new Error("messages must contain between 1 and 40 items"), { code: "invalid_messages", status: 400 });
  }
  return messages.map((message) => {
    if (!message || !["system", "user", "assistant"].includes(message.role) || typeof message.content !== "string") {
      throw Object.assign(new Error("Each message needs an allowed role and string content"), { code: "invalid_messages", status: 400 });
    }
    if (message.content.length > 20_000) throw Object.assign(new Error("A message exceeds the 20000 character limit"), { code: "message_too_large", status: 413 });
    return { role: message.role, content: message.content };
  });
}

async function requestJson({ url, headers, body, fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(Number(timeoutMs) || 60_000, MAX_TIMEOUT_MS)));
  try {
    const response = await fetchImpl(url, {
      method: "POST", headers, body: JSON.stringify(body), signal: controller.signal, redirect: "error"
    });
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw Object.assign(new Error("AI provider response exceeded the size limit"), { code: "provider_response_too_large", status: 502 });
    }
    let payload = {};
    try { payload = text ? JSON.parse(text) : {}; }
    catch { throw Object.assign(new Error("AI provider returned invalid JSON"), { code: "invalid_provider_response", status: 502 }); }
    if (!response.ok) {
      throw Object.assign(new Error(payload?.error?.message || `AI provider returned HTTP ${response.status}`), { code: "provider_request_failed", status: 502 });
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw Object.assign(new Error("AI provider request timed out"), { code: "provider_timeout", status: 504 });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function anthropicCompletion({ provider, messages, fetchImpl, timeoutMs }) {
  if (!provider.apiKey) throw Object.assign(new Error("This provider requires a server-side API key"), { code: "provider_not_configured", status: 503 });
  const normalized = validateMessages(messages);
  const systems = normalized.filter((message) => message.role === "system").map((message) => message.content);
  const body = {
    model: provider.model,
    max_tokens: 2048,
    messages: normalized.filter((message) => message.role !== "system").map(({ role, content }) => ({ role, content }))
  };
  if (systems.length) body.system = systems.join("\n\n");
  const base = nativeProviderBase(provider.baseUrl);
  const url = new URL("messages", base);
  const payload = await requestJson({
    url,
    headers: { "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json", accept: "application/json" },
    body, fetchImpl, timeoutMs
  });
  const content = Array.isArray(payload.content) ? payload.content.filter((part) => part.type === "text").map((part) => part.text || "").join("") : "";
  if (!content) throw Object.assign(new Error("Anthropic returned no text content"), { code: "invalid_provider_response", status: 502 });
  return { content, model: payload.model || provider.model, usage: payload.usage || null };
}

async function geminiCompletion({ provider, messages, fetchImpl, timeoutMs }) {
  if (!provider.apiKey) throw Object.assign(new Error("This provider requires a server-side API key"), { code: "provider_not_configured", status: 503 });
  const normalized = validateMessages(messages);
  const systemMessages = normalized.filter((message) => message.role === "system").map((message) => message.content);
  const contents = normalized.filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }]
  }));
  if (!contents.length) throw Object.assign(new Error("At least one user or assistant message is required"), { code: "invalid_messages", status: 400 });
  const body = { contents, generationConfig: { maxOutputTokens: 2048 } };
  if (systemMessages.length) body.systemInstruction = { parts: [{ text: systemMessages.join("\n\n") }] };
  const base = new URL(provider.baseUrl);
  base.pathname = base.pathname.endsWith("/") ? base.pathname : base.pathname + "/";
  const url = new URL(`models/${encodeURIComponent(provider.model)}:generateContent`, base);
  const payload = await requestJson({
    url,
    headers: { "x-goog-api-key": provider.apiKey, "content-type": "application/json", accept: "application/json" },
    body, fetchImpl, timeoutMs
  });
  const content = payload?.candidates?.[0]?.content?.parts?.filter((part) => typeof part.text === "string").map((part) => part.text).join("") || "";
  if (!content) throw Object.assign(new Error("Gemini returned no text content"), { code: "invalid_provider_response", status: 502 });
  return { content, model: provider.model, usage: payload.usageMetadata || null };
}

export async function createProviderCompletion({ provider, messages, fetchImpl = fetch, timeoutMs } = {}) {
  if (!provider || !provider.baseUrl || !provider.model) {
    throw Object.assign(new Error("AI provider configuration is incomplete"), { code: "provider_not_configured", status: 503 });
  }
  const protocol = provider.protocol || "openai-compatible";
  if (protocol === "openai-compatible") {
    return createChatCompletion({ apiKey: provider.apiKey, baseUrl: provider.baseUrl, model: provider.model, messages, fetchImpl, timeoutMs });
  }
  if (protocol === "anthropic") return anthropicCompletion({ provider, messages, fetchImpl, timeoutMs });
  if (protocol === "gemini") return geminiCompletion({ provider, messages, fetchImpl, timeoutMs });
  throw Object.assign(new Error("Unsupported AI provider protocol"), { code: "unsupported_provider_protocol", status: 400 });
}
