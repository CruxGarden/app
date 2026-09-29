/** Independent queues: operations for one key run in order, including after a failure. */
export function createKeyedQueue() {
  const pending = new Map<string, Promise<unknown>>();
  return async function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (pending.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    pending.set(key, result);
    try {
      return await result;
    } finally {
      if (pending.get(key) === result) pending.delete(key);
    }
  };
}
