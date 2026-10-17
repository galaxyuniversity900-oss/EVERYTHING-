import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(url, child, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("AI server exited before becoming healthy");
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch { /* The server may still be starting. */ }
    await delay(100);
  }
  throw new Error("AI server did not become healthy in time");
}

test("AI chat endpoint rejects concurrent work when configured capacity is full", async (t) => {
  let activeUpstreamCalls = 0;
  let maxUpstreamCalls = 0;
  const providerServer = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    activeUpstreamCalls += 1;
    maxUpstreamCalls = Math.max(maxUpstreamCalls, activeUpstreamCalls);
    try {
      for await (const _chunk of req) { /* Consume the bounded JSON request body. */ }
      await delay(900);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "test-model", choices: [{ message: { content: "mock inference completed" } }] }));
    } finally {
      activeUpstreamCalls -= 1;
    }
  });
  await new Promise((resolve, reject) => providerServer.listen(0, "127.0.0.1", resolve).once("error", reject));
  const providerPort = providerServer.address().port;

  const appPort = await freePort();
  const profile = [{
    id: "test-provider",
    name: "Concurrency test provider",
    protocol: "openai-compatible",
    baseUrl: `http://127.0.0.1:${providerPort}/v1`,
    model: "test-model",
    capabilities: ["chat"]
  }];
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(appPort),
      AUTH_PASSWORD: "",
      AI_API_ENABLED: "true",
      AI_MAX_CONCURRENT_REQUESTS: "1",
      AI_DEFAULT_PROVIDER: "test-provider",
      AI_PROVIDERS_JSON: JSON.stringify(profile)
    },
    stdio: "ignore"
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(1500)
    ]);
    await new Promise((resolve) => providerServer.close(() => resolve()));
  });

  const base = `http://127.0.0.1:${appPort}`;
  await waitForHealth(`${base}/api/health`, child);
  const chatBody = JSON.stringify({
    providerId: "test-provider",
    task: "chat",
    messages: [{ role: "user", content: "Answer with a short phrase." }]
  });

  const firstPromise = fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: chatBody,
    signal: AbortSignal.timeout(6000)
  });
  await delay(120);
  const secondResponse = await fetch(`${base}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: chatBody,
    signal: AbortSignal.timeout(3000)
  });
  const secondPayload = await secondResponse.json();
  assert.equal(secondResponse.status, 429);
  assert.equal(secondPayload.error?.code, "ai_busy");

  const firstResponse = await firstPromise;
  const firstPayload = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(firstPayload.content, "mock inference completed");
  assert.equal(maxUpstreamCalls, 1);
});
