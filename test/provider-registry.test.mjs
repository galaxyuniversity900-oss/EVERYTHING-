import test from "node:test";
import assert from "node:assert/strict";
import { getAIProviderRegistry, publicAIProviderRegistry } from "../src/ai/provider-registry.mjs";

test("legacy single-provider configuration remains supported", () => {
  const env = { AI_API_ENABLED: "true", OPENAI_API_KEY: "key-value", OPENAI_MODEL: "test-model" };
  const result = getAIProviderRegistry(env);
  assert.equal(result.defaultProviderId, "default");
  assert.equal(result.providers[0].configured, true);
});

test("multiple provider protocols resolve key references server-side", () => {
  const env = {
    AI_API_ENABLED: "true",
    AI_DEFAULT_PROVIDER: "nvidia",
    NVIDIA_API_KEY: "nvidia-key",
    ANTHROPIC_API_KEY: "anthropic-key",
    GEMINI_API_KEY: "gemini-key",
    AI_PROVIDERS_JSON: JSON.stringify([
      { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", model: "configured-model", apiKeyEnv: "NVIDIA_API_KEY", capabilities: ["chat", "reasoning"] },
      { id: "local", name: "Local model", baseUrl: "http://127.0.0.1:11434/v1", model: "local-model", capabilities: ["chat"] },
      { id: "claude", name: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "configured-model", apiKeyEnv: "ANTHROPIC_API_KEY", capabilities: ["chat", "reasoning"] },
      { id: "gemini", name: "Google Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-test", apiKeyEnv: "GEMINI_API_KEY", capabilities: ["chat", "coding"] }
    ])
  };
  const result = getAIProviderRegistry(env);
  assert.equal(result.defaultProviderId, "nvidia");
  assert.equal(result.providers[0].apiKey, "nvidia-key");
  assert.equal(result.providers[1].configured, true);
  assert.equal(result.providers[2].protocol, "anthropic");
  assert.equal(result.providers[2].configured, true);
  assert.equal(result.providers[3].protocol, "gemini");
  assert.equal(result.providers[3].configured, true);
  const publicView = publicAIProviderRegistry(env);
  assert.equal(JSON.stringify(publicView).includes("nvidia-key"), false);
  assert.equal(JSON.stringify(publicView).includes("anthropic-key"), false);
  assert.equal(publicView.providers.length, 4);
});

test("invalid provider JSON is reported without exposing the raw parse message publicly", () => {
  const env = { AI_API_ENABLED: "true", AI_PROVIDERS_JSON: '{"token":"private-value", broken}' };
  const invalid = getAIProviderRegistry(env);
  const publicView = publicAIProviderRegistry(env);
  assert.equal(invalid.providers.length, 0);
  assert.ok(invalid.configurationError);
  assert.equal(JSON.stringify(publicView).includes("private-value"), false);
  assert.equal(publicView.configurationError, "AI_PROVIDERS_JSON is invalid; review server configuration.");
});

test("AI stays disabled unless explicitly enabled", () => {
  const result = getAIProviderRegistry({ OPENAI_API_KEY: "key-value" });
  assert.equal(result.providers[0].configured, false);
});


test("internal HTTP model services require explicit opt-in and single-label service names", () => {
  const profiles = JSON.stringify([
    { id: "ollama", name: "Ollama", protocol: "openai-compatible", baseUrl: "http://ollama:11434/v1", model: "qwen2.5:1.5b", capabilities: ["chat"] },
    { id: "dotted", name: "Dotted host", protocol: "openai-compatible", baseUrl: "http://ollama.internal:11434/v1", model: "model-x", capabilities: ["chat"] },
    { id: "anthropic-http", name: "Invalid native provider", protocol: "anthropic", baseUrl: "http://anthropic:8080/v1", model: "model-x", capabilities: ["chat"] }
  ]);
  const disabled = getAIProviderRegistry({ AI_API_ENABLED: "true", AI_PROVIDERS_JSON: profiles });
  assert.equal(disabled.providers[0].configured, false);

  const enabled = getAIProviderRegistry({ AI_API_ENABLED: "true", AI_ALLOW_INTERNAL_HTTP: "true", AI_PROVIDERS_JSON: profiles });
  assert.equal(enabled.providers[0].configured, true);
  assert.equal(enabled.providers[0].allowInternalHttp, true);
  assert.equal(enabled.providers[1].configured, false);
  assert.equal(enabled.providers[2].configured, false);
  const publicView = publicAIProviderRegistry({ AI_API_ENABLED: "true", AI_ALLOW_INTERNAL_HTTP: "true", AI_PROVIDERS_JSON: profiles });
  assert.equal(publicView.providers[0].internalHttp, true);
  assert.equal(JSON.stringify(publicView).includes("baseUrl"), false);
});
