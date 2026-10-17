const ID_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;
const ENV_PATTERN = /^[A-Z_][A-Z0-9_]{0,127}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function endpointSafety(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const local = LOOPBACK_HOSTS.has(url.hostname) && url.protocol === "http:";
    const secureRemote = url.protocol === "https:";
    const safe = (local || secureRemote) && !url.username && !url.password && !url.hash && !url.search;
    return { safe, local };
  } catch { return { safe: false, local: false }; }
}

function configuredProvider(profile, env, globallyEnabled) {
  const id = typeof profile.id === "string" ? profile.id : "";
  const name = (typeof profile.name === "string" ? profile.name : id).slice(0, 120);
  const baseUrl = typeof profile.baseUrl === "string" ? profile.baseUrl.slice(0, 2048) : "";
  const model = typeof profile.model === "string" ? profile.model.slice(0, 160) : "";
  const apiKeyEnv = typeof profile.apiKeyEnv === "string" && ENV_PATTERN.test(profile.apiKeyEnv) ? profile.apiKeyEnv : "";
  const apiKey = apiKeyEnv ? env[apiKeyEnv] || "" : "";
  const safety = endpointSafety(baseUrl);
  const enabled = profile.enabled !== false;
  const capabilities = Array.isArray(profile.capabilities)
    ? [...new Set(profile.capabilities.filter((value) => typeof value === "string" && ID_PATTERN.test(value)))].slice(0, 20)
    : ["chat"];
  return {
    id, name, baseUrl, model, apiKeyEnv, apiKey, local: safety.local, enabled, capabilities,
    configured: Boolean(globallyEnabled && enabled && safety.safe && baseUrl && model && (apiKey || safety.local))
  };
}

export function getAIProviderRegistry(env = process.env) {
  const globallyEnabled = env.AI_API_ENABLED === "true";
  let profiles;
  let configurationError = null;
  if (env.AI_PROVIDERS_JSON) {
    try {
      profiles = JSON.parse(env.AI_PROVIDERS_JSON);
      if (!Array.isArray(profiles) || profiles.length > 20) throw new Error("AI_PROVIDERS_JSON must be an array of at most 20 profiles");
    } catch (error) {
      profiles = [];
      configurationError = error.message || "AI_PROVIDERS_JSON is invalid";
    }
  } else {
    profiles = [{
      id: "default",
      name: "OpenAI-compatible API",
      baseUrl: env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      apiKeyEnv: "OPENAI_API_KEY",
      capabilities: ["chat"]
    }];
  }

  const seen = new Set();
  const providers = [];
  for (const profile of profiles) {
    if (!profile || typeof profile !== "object" || typeof profile.id !== "string" || !ID_PATTERN.test(profile.id) || seen.has(profile.id)) continue;
    if (typeof profile.baseUrl !== "string" || typeof profile.model !== "string") continue;
    seen.add(profile.id);
    providers.push(configuredProvider(profile, env, globallyEnabled));
  }
  const requestedDefault = env.AI_DEFAULT_PROVIDER || "default";
  const defaultProvider = providers.find((provider) => provider.id === requestedDefault && provider.configured)
    || providers.find((provider) => provider.configured)
    || null;
  return { providers, defaultProviderId: defaultProvider?.id || null, fallbackEnabled: env.AI_FALLBACK_ENABLED === "true", configurationError };
}

export function publicAIProviderRegistry(env = process.env) {
  const registry = getAIProviderRegistry(env);
  return {
    providers: registry.providers.map(({ id, name, model, configured, enabled, capabilities, local }) => ({
      id, name, model: configured ? model : null, configured, enabled, capabilities, local
    })),
    enabled: registry.providers.some((provider) => provider.configured),
    defaultProviderId: registry.defaultProviderId,
    fallbackEnabled: registry.fallbackEnabled,
    configurationError: registry.configurationError ? "AI_PROVIDERS_JSON is invalid; review server configuration." : null
  };
}
