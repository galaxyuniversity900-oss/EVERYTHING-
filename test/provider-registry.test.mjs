import test from "node:test";
import assert from "node:assert/strict";
import { getAIProviderRegistry, publicAIProviderRegistry } from "../src/ai/provider-registry.mjs";

test("legacy single-provider configuration remains supported", () => {
  const env = { AI_API_ENABLED: "true", OPENAI_API_KEY: "key-value", OPENAI_MODEL: "test-model" };
  const result = getAIProviderRegistry(env);
  assert.equal(result.defaultProviderId, "default");
  assert.equal(result.providers[0].configured, true);
});

test("multiple providers resolve key references from the server environment", () => {
  const env = {
    AI_API_ENABLED: "true",
    AI_DEFAULT_PROVIDER: "nvidia",
    NVIDIA_API_KEY: "key-value",
    AI_PROVIDERS_JSON: JSON.stringify([
      { id: "nvidia", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", model: "configured-model", apiKeyEnv: "NVIDIA_API_KEY", capabilities: ["chat", "reasoning"] },
      { id: "local", name: "Local model", baseUrl: "http://127.0.0.1:11434/v1", model: "local-model", capabilities: ["chat"] }
    ])
  };
  const result = getAIProviderRegistry(env);
  assert.equal(result.defaultProviderId, "nvidia");
  assert.equal(result.providers[0].apiKey, "key-value");
  assert.equal(result.providers[1].configured, true);
  const publicView = publicAIProviderRegistry(env);
  assert.equal(JSON.stringify(publicView).includes("key-value"), false);
  assert.equal(publicView.providers.length, 2);
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
