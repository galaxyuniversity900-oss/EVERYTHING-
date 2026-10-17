import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../public/remote.js", import.meta.url), "utf8");

test("remote session cards display expiry metadata when provided", () => {
  assert.match(script, /session\.expiresAt/);
  assert.match(script, /toLocaleString\(\)/);
  assert.match(script, /Expiry managed by runtime/);
});

test("remote app launch is disabled when advertised capacity is exhausted", () => {
  assert.match(script, /function renderApps\(apps, capacity = null\)/);
  assert.match(script, /capacityFull = Number\.isFinite\(capacity\?\.availableSlots\) && capacity\.availableSlots <= 0/);
  assert.match(script, /launch\.disabled = capacityFull/);
  assert.match(script, /renderApps\(data\.apps \|\| \[\], data\.capacity \|\| null\)/);
});
