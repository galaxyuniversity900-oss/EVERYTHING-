import test from "node:test";
import assert from "node:assert/strict";
import { apps, getApps } from "../src/registry.mjs";

test("registry has unique, non-empty application ids", () => {
  const ids = apps.map((app) => app.id);
  assert.ok(ids.length >= 45, "catalog should cover the upstream application set");
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(Boolean));
});

test("every catalog entry has secure source attribution and explicit hosted status", () => {
  assert.ok(apps.some((app) => app.hosted === true));
  assert.ok(apps.some((app) => app.hosted === false));
  for (const app of apps) {
    assert.match(app.url, /^https:\/\//);
    assert.match(app.source, /^https:\/\//);
    assert.match(app.source, /^https:\/\/github\.com\/HeyPuter\/everything\/tree\/main\//);
    assert.ok(app.name && app.category && app.description);
    if (app.hosted) assert.doesNotMatch(app.url, /^https:\/\/github\.com\/HeyPuter\/everything\/tree\/main\//);
    else assert.match(app.url, /^https:\/\/github\.com\/HeyPuter\/everything\/tree\/main\//);
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
