import test from "node:test";
import assert from "node:assert/strict";
import { createProviderCompletion } from "../src/ai/provider-adapters.mjs";

test("Anthropic adapter maps system and chat messages to Messages API", async () => {
  let url;
  let options;
  const result = await createProviderCompletion({
    provider: { protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "configured-model", apiKey: "test-key" },
    messages: [{ role: "system", content: "Be concise" }, { role: "user", content: "Hello" }],
    fetchImpl: async (requestedUrl, requestOptions) => {
      url = String(requestedUrl);
      options = requestOptions;
      return new Response(JSON.stringify({ model: "configured-model", content: [{ type: "text", text: "Hello back" }], usage: { input_tokens: 2, output_tokens: 3 } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  });
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  assert.equal(options.headers["x-api-key"], "test-key");
  assert.equal(JSON.parse(options.body).system, "Be concise");
  assert.equal(result.content, "Hello back");
});

test("Gemini adapter maps assistant messages to model role", async () => {
  let url;
  let options;
  const result = await createProviderCompletion({
    provider: { protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-test", apiKey: "test-key" },
    messages: [{ role: "user", content: "Question" }, { role: "assistant", content: "Previous answer" }],
    fetchImpl: async (requestedUrl, requestOptions) => {
      url = String(requestedUrl);
      options = requestOptions;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Answer" }] } }], usageMetadata: { totalTokenCount: 8 } }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  });
  assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
  assert.equal(options.headers["x-goog-api-key"], "test-key");
  assert.equal(JSON.parse(options.body).contents[1].role, "model");
  assert.equal(result.content, "Answer");
});

test("native provider adapters reject missing credentials", async () => {
  await assert.rejects(
    createProviderCompletion({ provider: { protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "x" }, messages: [{ role: "user", content: "hi" }] }),
    (error) => error.code === "provider_not_configured"
  );
});
