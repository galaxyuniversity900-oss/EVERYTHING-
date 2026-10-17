import test from "node:test";
import assert from "node:assert/strict";
import { apps, getApps } from "../src/registry.mjs";

test("registry has unique, non-empty application ids", () => {
  const ids = apps.map((app) => app.id);
  assert.ok(ids.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(Boolean));
});

test("every catalog entry has a secure external URL and source", () => {
  for (const app of apps) {
    assert.match(app.url, /^https:\/\//);
    assert.match(app.source, /^https:\/\//);
    assert.ok(app.name && app.category && app.description);
  }
});

test("category filter returns only the selected category", () => {
  const results = getApps({ category: "Office" });
  assert.ok(results.length > 0);
  assert.ok(results.every((app) => app.category === "Office"));
});

test("search is case-insensitive and matches app names", () => {
  assert.equal(getApps({ query: "SPREADSHEET" }).length, 1);
});

test("unknown search terms return an empty result", () => {
  assert.deepEqual(getApps({ query: "no-such-tool-xyz" }), []);
});
