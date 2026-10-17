import test from "node:test";
import assert from "node:assert/strict";
import { createChatCompletion } from "../src/ai/openai-compatible.mjs";

test("AI adapter rejects missing API keys before making network calls", async () => {
  await assert.rejects(
    createChatCompletion({ apiKey: "", model: "test-model", messages: [{ role: "user", content: "hello" }] }),
    (error) => error.code === "provider_not_configured" && error.status === 503
  );
});

test("AI adapter validates message roles", async () => {
  await assert.rejects(
    createChatCompletion({ apiKey: "test-key", model: "test-model", messages: [{ role: "tool", content: "hello" }] }),
    (error) => error.code === "invalid_messages"
  );
});

test("AI adapter calls a compatible endpoint and normalizes the response", async () => {
  let requestedUrl;
  let requestedBody;
  const result = await createChatCompletion({
    apiKey: "test-key",
    baseUrl: "https://example.test/v1",
    model: "example-model",
    messages: [{ role: "user", content: "hello" }],
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ model: "example-model", choices: [{ message: { content: "hello back" } }], usage: { total_tokens: 4 } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  });
  assert.equal(requestedUrl, "https://example.test/v1/chat/completions");
  assert.equal(requestedBody.messages[0].content, "hello");
  assert.equal(result.content, "hello back");
  assert.equal(result.usage.total_tokens, 4);
});

test("AI adapter refuses cleartext remote provider URLs", async () => {
  await assert.rejects(
    createChatCompletion({ apiKey: "test-key", baseUrl: "http://example.test/v1", model: "x", messages: [{ role: "user", content: "hi" }] }),
    (error) => error.code === "insecure_provider_url"
  );
});
