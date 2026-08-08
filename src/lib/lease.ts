/**
 * Lease pools for shared, expensive, per-key resources (the local preview and
 * dev servers).
 *
 * The problem this solves: those servers belong to a CRUX, but they are
 * started from per-tab React effects. Naive start/stop in an effect restarts
 * the server on every tab switch and races an in-flight start against the
 * previous tab's stop. A lease pool makes the resource live while anyone holds
 * it, and shuts it down only after the last holder releases AND a grace period
 * passes without a re-acquire — which is exactly the unmount→remount gap.
 */

export interface LeasePool {
  /** Take a lease; cancels any pending shutdown for this key. */
  acquire(key: string): void;
  /** Drop a lease. Returns the number of leases still held. */
  release(key: string): number;
  /** Leases currently held for a key. */
  count(key: string): number;
  /** Cancel timers and forget all leases (tests, teardown). */
  reset(): void;
}

export function createLeasePool(options: {
  /** How long to wait after the last release before shutting down. */
  graceMs: number;
  /** Shut the resource down. Only called when no leases remain. */
  stop: (key: string) => void | Promise<void>;
  /** Error sink for stop() failures (defaults to swallowing). */
  onStopError?: (key: string, err: unknown) => void;
}): LeasePool {
  const counts = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function cancelPendingStop(key: string): void {
    const timer = timers.get(key);
    if (timer) {
      clearTimeout(timer);
      timers.delete(key);
    }
  }

  return {
    acquire(key) {
      cancelPendingStop(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    },

    release(key) {
      const remaining = Math.max(0, (counts.get(key) ?? 0) - 1);
      if (remaining === 0) counts.delete(key);
      else counts.set(key, remaining);
      if (remaining > 0 || timers.has(key)) return remaining;

      const timer = setTimeout(() => {
        timers.delete(key);
        // Re-acquired during the grace period — the resource is still wanted
        if ((counts.get(key) ?? 0) > 0) return;
        try {
          const result = options.stop(key);
          if (result instanceof Promise) {
            result.catch((err) => options.onStopError?.(key, err));
          }
        } catch (err) {
          options.onStopError?.(key, err);
        }
      }, options.graceMs);
      timers.set(key, timer);
      return remaining;
    },

    count(key) {
      return counts.get(key) ?? 0;
    },

    reset() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      counts.clear();
    },
  };
}
