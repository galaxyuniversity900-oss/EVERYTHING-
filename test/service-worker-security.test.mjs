import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

test("offline catalog cache fails closed until auth mode is known", () => {
  assert.match(worker, /AUTH_MODE_KEY/);
  assert.match(worker, /if \(!marker\) return true/);
  assert.match(worker, /authentication_required/);
});

test("auth-required catalog responses are not stored for offline use", () => {
  assert.match(worker, /url\.pathname === "\/api\/auth\/status"/);
  assert.match(worker, /if \(response\.status === 401\)/);
  assert.match(worker, /await cache\.delete\(request\)/);
  assert.match(worker, /if \(await isAuthRequired\(cache\)\) await cache\.delete\(request\)/);
  assert.match(worker, /everything-shell-v7/);
});
