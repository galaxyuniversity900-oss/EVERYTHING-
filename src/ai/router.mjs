import { createChatCompletion } from "./openai-compatible.mjs";
import { getAIProviderRegistry } from "./provider-registry.mjs";

export async function routeAIChat({ env = process.env, messages, providerId, task = "chat", fetchImpl = fetch } = {}) {
  const registry = getAIProviderRegistry(env);
  const configured = registry.providers.filter((provider) => provider.configured);
  if (!configured.length) {
    throw Object.assign(new Error(registry.configurationError || "No AI provider is configured. Enable AI and configure a valid endpoint/key."), {
      code: "provider_not_configured", status: 503
    });
  }
  let selected;
  if (providerId) {
    selected = configured.find((provider) => provider.id === providerId);
    if (!selected) throw Object.assign(new Error("The requested AI provider is not configured"), { code: "unknown_provider", status: 400 });
  } else {
    selected = configured.find((provider) => provider.id === registry.defaultProviderId)
      || configured.find((provider) => provider.capabilities.includes(task))
      || configured[0];
  }
  const ordered = [selected];
  if (registry.fallbackEnabled) {
    for (const candidate of configured) {
      if (candidate.id !== selected.id && (!candidate.capabilities.length || candidate.capabilities.includes(task))) ordered.push(candidate);
    }
  }
  let lastError;
  for (const provider of ordered) {
    try {
      const result = await createChatCompletion({
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        model: provider.model,
        messages,
        fetchImpl
      });
      return { ...result, providerId: provider.id, providerName: provider.name, task };
    } catch (error) {
      lastError = error;
      if (!registry.fallbackEnabled || ![429, 502, 503, 504].includes(error.status)) throw error;
    }
  }
  throw lastError || Object.assign(new Error("No AI provider could complete the request"), { code: "provider_request_failed", status: 502 });
}
