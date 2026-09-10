/** Bounds active turns within one Crux. Waiting turns remain visible and stoppable. */
export function createTaskSlots(limit: () => number) {
  const active = new Map<string, number>();
  const waiting: {
    owner: string;
    signal: AbortSignal;
    resolve: (release: () => void) => void;
    reject: (reason: Error) => void;
    abort: () => void;
  }[] = [];
  function pump() {
    for (let i = 0; i < waiting.length; ) {
      const entry = waiting[i]!;
      if ((active.get(entry.owner) ?? 0) >= limit()) {
        i++;
        continue;
      }
      waiting.splice(i, 1);
      entry.signal.removeEventListener('abort', entry.abort);
      active.set(entry.owner, (active.get(entry.owner) ?? 0) + 1);
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        const remaining = (active.get(entry.owner) ?? 1) - 1;
        if (remaining) active.set(entry.owner, remaining);
        else active.delete(entry.owner);
        pump();
      });
    }
  }
  return {
    busy: (owner: string) => (active.get(owner) ?? 0) >= limit(),
    acquire(owner: string, signal: AbortSignal): Promise<() => void> {
      if (signal.aborted)
        return Promise.reject(new Error('Stopped while waiting for a task slot.'));
      return new Promise((resolve, reject) => {
        const entry = {
          owner,
          signal,
          resolve,
          reject,
          abort: () => {
            const index = waiting.indexOf(entry);
            if (index >= 0) waiting.splice(index, 1);
            reject(new Error('Stopped while waiting for a task slot.'));
          },
        };
        waiting.push(entry);
        signal.addEventListener('abort', entry.abort, { once: true });
        pump();
      });
    },
  };
}
