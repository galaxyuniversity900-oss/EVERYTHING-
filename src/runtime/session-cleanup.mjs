export async function cleanupRemoteSessions({ sessionIds, runtime, timeoutMs = 5000 } = {}) {
  const ids = [...new Set(sessionIds || [])].filter((id) => typeof id === "string" && /^[a-zA-Z0-9_.:-]{1,200}$/.test(id));
  if (ids.length === 0) return { attempted: 0, closed: 0, failed: 0, timedOut: false };
  if (!runtime || typeof runtime.deleteSession !== "function") {
    return { attempted: ids.length, closed: 0, failed: ids.length, timedOut: false };
  }

  let timer;
  const cleanup = Promise.allSettled(ids.map((id) => runtime.deleteSession(id)));
  const result = await Promise.race([
    cleanup.then((results) => ({ results })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), Math.max(100, Math.min(timeoutMs, 30_000)));
    })
  ]);
  clearTimeout(timer);

  if (result.timedOut) {
    return { attempted: ids.length, closed: 0, failed: ids.length, timedOut: true };
  }
  const closed = result.results.filter((item) => item.status === "fulfilled").length;
  return { attempted: ids.length, closed, failed: ids.length - closed, timedOut: false };
}
