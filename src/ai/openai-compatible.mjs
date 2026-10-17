const MAX_TIMEOUT_MS = 90_000;

export async function createChatCompletion({
  apiKey,
  baseUrl = "https://api.openai.com/v1",
  model,
  messages,
  fetchImpl = fetch,
  timeoutMs = 60_000
}) {
  if (!apiKey) throw Object.assign(new Error("AI provider is not configured"), { code: "provider_not_configured", status: 503 });
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
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw Object.assign(new Error("AI base URL is invalid"), { code: "invalid_provider_url", status: 500 });
  }
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(base.hostname)) {
    throw Object.assign(new Error("AI provider URL must use HTTPS outside localhost"), { code: "insecure_provider_url", status: 500 });
  }
  const endpoint = new URL("chat/completions", base.href.endsWith("/") ? base : new URL(base.href + "/"));
  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(Number(timeoutMs) || 60_000, MAX_TIMEOUT_MS));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ model, messages: safeMessages, stream: false }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 502 : 502;
      throw Object.assign(new Error(payload?.error?.message || `AI provider returned HTTP ${response.status}`), { code: "provider_request_failed", status });
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
