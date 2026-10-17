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
