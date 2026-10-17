import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const registry = await readFile(new URL("../src/ai/provider-registry.mjs", import.meta.url), "utf8");
const gpu = await readFile(new URL("../compose.gpu.yaml", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/ollama-e2e.yml", import.meta.url), "utf8");

test("Ollama is opt-in, private-network-only, persistent, and resource-capped", () => {
  const start = compose.indexOf("\n  ollama:\n");
  const end = compose.indexOf("\n  ollama-model-init:\n", start);
  assert.ok(start > 0 && end > start);
  const service = compose.slice(start, end);
  assert.match(service, /profiles: \["local-ai"\]/);
  assert.match(service, /OLLAMA_CONTEXT_LENGTH: \$\{OLLAMA_CONTEXT_LENGTH:-4096\}/);
  assert.match(service, /OLLAMA_NO_CLOUD: "true"/);
  assert.match(service, /ollama-data:\/root\/\.ollama/);
  assert.match(service, /mem_limit: \$\{OLLAMA_MEMORY_LIMIT:-3g\}/);
  assert.match(service, /cpus: \$\{OLLAMA_CPUS:-2\.0\}/);
  assert.match(service, /expose:\n      - "11434"/);
  assert.doesNotMatch(service, /\n    ports:/);
});

test("model pull runs inside the container and AI stays disabled by default", () => {
  const initStart = compose.indexOf("\n  ollama-model-init:\n");
  assert.ok(initStart > 0);
  const init = compose.slice(initStart);
  assert.match(init, /OLLAMA_MODEL: \$\{OLLAMA_MODEL:-qwen2\.5:1\.5b\}/);
  assert.match(init, /\$\$\{OLLAMA_MODEL\}/);
  assert.match(env, /^AI_API_ENABLED=false$/m);
  assert.match(env, /^AI_ALLOW_INTERNAL_HTTP=false$/m);
  assert.match(registry, /AI_ALLOW_INTERNAL_HTTP === "true"/);
  assert.match(registry, /isInternalServiceHost/);
});


test("NVIDIA acceleration is a separate opt-in overlay on the Ollama service only", () => {
  assert.match(gpu, /services:\n  ollama:/);
  assert.match(gpu, /driver: nvidia/);
  assert.match(gpu, /count: 1/);
  assert.match(gpu, /capabilities: \[gpu\]/);
  assert.doesNotMatch(gpu, /everything:/);
});


test("live Ollama test is manual and scheduled, and verifies actual model output", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /OLLAMA_MODEL=qwen2\.5:0\.5b/);
  assert.match(workflow, /\/api\/ai\/providers\/check/);
  assert.match(workflow, /\/api\/ai\/chat/);
  assert.match(workflow, /typeof d\.content !== "string"/);
  assert.match(workflow, /docker compose --profile local-ai down/);
});
