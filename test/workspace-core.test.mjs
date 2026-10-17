import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkspaceItem, validateWorkspaceImport, MAX_WORKSPACE_ITEMS, MAX_ITEM_CONTENT } from "../public/workspace-core.js";

test("workspace item normalization trims titles and limits type values", () => {
  const item = normalizeWorkspaceItem({ title: "  Draft  ", type: "unknown", content: "hello" }, {
    idFactory: () => "item-test",
    now: () => "2026-01-01T00:00:00.000Z"
  });
  assert.equal(item.title, "Draft");
  assert.equal(item.type, "note");
  assert.equal(item.id, "item-test");
});

test("workspace item requires a title and bounds content", () => {
  assert.throws(() => normalizeWorkspaceItem({ title: " ", content: "" }), /Title is required/);
  assert.throws(() => normalizeWorkspaceItem({ title: "Large", content: "x".repeat(MAX_ITEM_CONTENT + 1) }), /100000 character limit/);
});

test("workspace import requires a bounded JSON array and unique identifiers", () => {
  assert.throws(() => validateWorkspaceImport({}), /JSON array/);
  assert.throws(() => validateWorkspaceImport(Array.from({ length: MAX_WORKSPACE_ITEMS + 1 }, (_, i) => ({ title: String(i), content: "" }))), /at most 200 items/);
  let nextId = 0;
  const items = validateWorkspaceImport([
    { id: "duplicate", title: "One", content: "a" },
    { id: "duplicate", title: "Two", content: "b" }
  ], { idFactory: () => `new-${++nextId}`, now: () => "2026-01-01T00:00:00.000Z" });
  assert.notEqual(items[0].id, items[1].id);
  const importedOverExisting = validateWorkspaceImport([{ id: "already-here", title: "Imported", content: "x" }], {
    existingIds: new Set(["already-here"]), idFactory: () => "new-id", now: () => "2026-01-01T00:00:00.000Z"
  });
  assert.equal(importedOverExisting[0].id, "new-id");
});
