/**
 * Ordered App Tool lifecycle, independent of the embedded editor's framework.
 * prepare validates without mutation and returns { mutates, apply, result? }.
 * save must wait for the host's fingerprint acknowledgement; settle commits
 * native edit buffers. The editor owns history, dirty generations and conflicts.
 */
export function createCommandSession({ settle, prepare, save }) {
  let tail = Promise.resolve();
  return {
    execute(command) {
      const operation = tail.then(async () => {
        await settle();
        const prepared = prepare(command);
        if (prepared.mutates) await save();
        const value = await prepared.apply();
        await settle();
        if (prepared.mutates) await save();
        return prepared.result ? prepared.result(value) : value;
      });
      // Keep the original rejection visible to its caller while releasing the queue.
      tail = operation.catch(() => {});
      return operation;
    },
  };
}
