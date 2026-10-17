import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../public/remote.js", import.meta.url), "utf8");

test("remote session cards display expiry metadata when provided", () => {
  assert.match(script, /session\.expiresAt/);
  assert.match(script, /toLocaleString\(\)/);
  assert.match(script, /Expiry managed by runtime/);
});
