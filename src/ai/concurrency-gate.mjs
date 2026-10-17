export function createConcurrencyGate(limit = 2) {
  const configured = Number.isFinite(limit) ? Math.trunc(limit) : 2;
  const capacity = Math.max(1, Math.min(16, configured));
  let active = 0;

  return {
    capacity,
    get active() {
      return active;
    },
    tryAcquire() {
      if (active >= capacity) return null;
      active += 1;
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          active = Math.max(0, active - 1);
        }
      };
    }
  };
}
