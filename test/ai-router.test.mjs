import test from "node:test";
import assert from "node:assert/strict";
import { routeAIChat } from "../src/ai/router.mjs";

test("router uses the configured default provider and returns its identity", async () => {
  const env = {
    AI_API_ENABLED: "true",
    OPENAI_API_KEY: "key-value",
    OPENAI_MODEL: "model-a",
    OPENAI_BASE_URL: "https://provider.example.test/v1"
  };
  const result = await routeAIChat({
    env,
    messages: [{ role: "user", content: "hello" }],
    fetchImpl: async () => new Response(JSON.stringify({ model: "model-a", choices: [{ message: { content: "ok" } }] }), {
      status: 200, headers: { "content-type": "application/json" }
    })
  });
  assert.equal(result.providerId, "default");
  assert.equal(result.content, "ok");
});

test("router rejects an unknown explicitly selected provider", async () => {
  await assert.rejects(
    routeAIChat({ env: { AI_API_ENABLED: "true", OPENAI_API_KEY: "key-value" }, providerId: "missing", messages: [{ role: "user", content: "x" }] }),
    (error) => error.code === "unknown_provider" && error.status === 400
  );
});

test("router selects a provider that declares the requested task capability", async () => {
  const env = {
    AI_API_ENABLED: "true",
    AI_DEFAULT_PROVIDER: "general",
    OPENAI_API_KEY: "general-key",
    CODER_KEY: "coder-key",
    AI_PROVIDERS_JSON: JSON.stringify([
      { id: "general", name: "General", baseUrl: "https://general.example.test/v1", model: "general-model", apiKeyEnv: "OPENAI_API_KEY", capabilities: ["chat"] },
      { id: "coder", name: "Coding model", baseUrl: "https://coder.example.test/v1", model: "coder-model", apiKeyEnv: "CODER_KEY", capabilities: ["coding"] }
    ])
  };
  let requestedUrl;
  const result = await routeAIChat({
    env, task: "coding", messages: [{ role: "user", content: "write a test" }],
    fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ model: "coder-model", choices: [{ message: { content: "test generated" } }] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  });
  assert.match(requestedUrl, /coder\.example\.test/);
  assert.equal(result.providerId, "coder");
});
