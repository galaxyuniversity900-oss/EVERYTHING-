import test from "node:test";
import assert from "node:assert/strict";
import { cleanupRemoteSessions } from "../src/runtime/session-cleanup.mjs";

test("shutdown cleanup attempts each unique tracked session", async () => {
  const deleted = [];
  const result = await cleanupRemoteSessions({
    sessionIds: ["session-1", "session-1", "session-2"],
    runtime: { deleteSession: async (id) => { deleted.push(id); return { deleted: true }; } }
  });
  assert.deepEqual(deleted.sort(), ["session-1", "session-2"]);
  assert.deepEqual(result, { attempted: 2, closed: 2, failed: 0, timedOut: false });
});

test("shutdown cleanup reports failed remote deletions without throwing", async () => {
  const result = await cleanupRemoteSessions({
    sessionIds: ["session-1", "session-2"],
    runtime: { deleteSession: async (id) => { if (id === "session-2") throw new Error("offline"); return { deleted: true }; } }
  });
  assert.deepEqual(result, { attempted: 2, closed: 1, failed: 1, timedOut: false });
});

test("shutdown cleanup has a bounded wait for unavailable remote workers", async () => {
  const result = await cleanupRemoteSessions({
    sessionIds: ["session-1"],
    timeoutMs: 100,
    runtime: { deleteSession: () => new Promise(() => {}) }
  });
  assert.deepEqual(result, { attempted: 1, closed: 0, failed: 1, timedOut: true });
});

test("shutdown cleanup safely handles empty or invalid session identifiers", async () => {
  const result = await cleanupRemoteSessions({
    sessionIds: [null, "../invalid", ""],
    runtime: { deleteSession: async () => { throw new Error("should not be called"); } }
  });
  assert.deepEqual(result, { attempted: 0, closed: 0, failed: 0, timedOut: false });
});
