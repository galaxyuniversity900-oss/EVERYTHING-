import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
const env = await readFile(new URL("../.env.example", import.meta.url), "utf8");
const registry = await readFile(new URL("../src/ai/provider-registry.mjs", import.meta.url), "utf8");

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
