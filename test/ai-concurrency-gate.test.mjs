import test from "node:test";
import assert from "node:assert/strict";
import { createConcurrencyGate } from "../src/ai/concurrency-gate.mjs";
import { readFile } from "node:fs/promises";

test("concurrency gate rejects new work at capacity and releases slots", () => {
  const gate = createConcurrencyGate(1);
  assert.equal(gate.capacity, 1);
  const first = gate.tryAcquire();
  assert.ok(first);
  assert.equal(gate.active, 1);
  assert.equal(gate.tryAcquire(), null);
  first.release();
  assert.equal(gate.active, 0);
  const next = gate.tryAcquire();
  assert.ok(next);
  next.release();
  assert.equal(gate.active, 0);
});

test("concurrency lease release is idempotent and cannot make active count negative", () => {
  const gate = createConcurrencyGate(2);
  const a = gate.tryAcquire();
  const b = gate.tryAcquire();
  assert.equal(gate.active, 2);
  a.release();
  a.release();
  b.release();
  assert.equal(gate.active, 0);
  assert.equal(gate.tryAcquire() !== null, true);
});

test("concurrency capacity is bounded to safe values", () => {
  assert.equal(createConcurrencyGate(0).capacity, 1);
  assert.equal(createConcurrencyGate(-10).capacity, 1);
  assert.equal(createConcurrencyGate(99).capacity, 16);
  assert.equal(createConcurrencyGate(Number.NaN).capacity, 2);
});

test("AI chat route acquires a concurrency slot and releases it in a finally block", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /AI_MAX_CONCURRENT_REQUESTS/);
  assert.match(server, /aiConcurrencyGate\.tryAcquire\(\)/);
  assert.match(server, /code: "ai_busy"/);
  assert.match(server, /finally\s*\{\s*lease\.release\(\);\s*\}/);
});
