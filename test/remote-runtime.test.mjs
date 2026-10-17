import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteRuntime } from "../src/runtime/remote-provider.mjs";

test("remote runtime requires explicit configuration", () => {
  assert.throws(() => createRemoteRuntime({ env: {} }), (error) => error.code === "remote_runtime_not_configured");
});

test("remote runtime rejects insecure non-local endpoints", () => {
  assert.throws(() => createRemoteRuntime({ env: { REMOTE_RUNTIME_URL: "http://runtime.example.test" } }), (error) => error.code === "unsafe_remote_runtime_url");
});

test("remote runtime discovers supported apps from its configured provider", async () => {
  const runtime = createRemoteRuntime({
    env: { REMOTE_RUNTIME_URL: "https://runtime.example.test/" },
    fetchImpl: async (url, options) => {
      assert.equal(String(url), "https://runtime.example.test/v1/capabilities");
      assert.equal(options.headers.authorization, undefined);
      return new Response(JSON.stringify({ provider: "test-provider", apps: [{ id: "editor", name: "Remote Editor" }, { id: "bad id" }] }), {
        status: 200, headers: { "content-type": "application/json" }
      });
    }
  });
  const result = await runtime.capabilities();
  assert.equal(result.provider, "test-provider");
  assert.deepEqual(result.apps.map((app) => app.id), ["editor"]);
});

test("remote runtime sends its token and validates returned session URLs", async () => {
  let auth;
  const runtime = createRemoteRuntime({
    env: { REMOTE_RUNTIME_URL: "https://runtime.example.test/", REMOTE_RUNTIME_TOKEN: "server-secret" },
    fetchImpl: async (_url, options) => {
      auth = options.headers.authorization;
      return new Response(JSON.stringify({ id: "session-123", url: "https://session.example.test/view" }), {
        status: 201, headers: { "content-type": "application/json" }
      });
    }
  });
  const result = await runtime.createSession("editor");
  assert.equal(auth, "Bearer server-secret");
  assert.equal(result.id, "session-123");
  assert.equal(result.url, "https://session.example.test/view");
});

test("remote runtime refuses unsafe session URLs returned by the provider", async () => {
  const runtime = createRemoteRuntime({
    env: { REMOTE_RUNTIME_URL: "https://runtime.example.test/" },
    fetchImpl: async () => new Response(JSON.stringify({ id: "session-1", url: "javascript:alert(1)" }), {
      status: 201, headers: { "content-type": "application/json" }
    })
  });
  await assert.rejects(runtime.createSession("editor"), (error) => error.code === "unsafe_remote_session_url");
});
