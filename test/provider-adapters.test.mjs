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


import { checkProviderConnection } from "../src/ai/provider-adapters.mjs";

test("OpenAI-compatible connection check uses the models endpoint without generating tokens", async () => {
  let requestedUrl;
  let auth;
  const result = await checkProviderConnection({
    provider: { id: "openai", configured: true, protocol: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "model-x", apiKey: "secret" },
    fetchImpl: async (url, options) => {
      requestedUrl = String(url);
      auth = options.headers.authorization;
      return new Response(JSON.stringify({ data: [{ id: "model-x" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(requestedUrl, "https://api.openai.com/v1/models");
  assert.equal(auth, "Bearer secret");
  assert.equal(result.ok, true);
  assert.equal(result.modelListed, true);
  assert.equal(Object.hasOwn(result, "apiKey"), false);
});

test("Anthropic and Gemini connection checks use their native auth headers", async () => {
  const calls = [];
  const providers = [
    { id: "claude", configured: true, protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-x", apiKey: "anthropic-secret" },
    { id: "gemini", configured: true, protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-x", apiKey: "gemini-secret" }
  ];
  const payloads = [
    { data: [{ id: "claude-x" }] },
    { models: [{ name: "models/gemini-x" }] }
  ];
  for (let index = 0; index < providers.length; index += 1) {
    const result = await checkProviderConnection({
      provider: providers[index],
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), headers: options.headers });
        return new Response(JSON.stringify(payloads[index]), { status: 200, headers: { "content-type": "application/json" } });
      }
    });
    assert.equal(result.modelListed, true);
  }
  assert.equal(calls[0].url, "https://api.anthropic.com/v1/models");
  assert.equal(calls[0].headers["x-api-key"], "anthropic-secret");
  assert.equal(calls[1].url, "https://generativelanguage.googleapis.com/v1beta/models");
  assert.equal(calls[1].headers["x-goog-api-key"], "gemini-secret");
});

test("provider connection check rejects unsafe URLs and hides transport details", async () => {
  await assert.rejects(
    checkProviderConnection({ provider: { configured: true, protocol: "openai-compatible", baseUrl: "http://example.test/v1", model: "x", apiKey: "secret" } }),
    (error) => error.code === "unsafe_provider_url"
  );
  await assert.rejects(
    checkProviderConnection({
      provider: { configured: true, protocol: "openai-compatible", baseUrl: "https://api.example.test/v1", model: "x", apiKey: "secret" },
      fetchImpl: async () => { throw new TypeError("internal socket detail"); }
    }),
    (error) => error.code === "provider_connection_failed" && !error.message.includes("internal socket detail")
  );
});
