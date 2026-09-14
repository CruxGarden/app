// Whole-layout history covers native Designer changes and public template updates.
export function layoutHistory(initial) {
  let current = JSON.stringify(initial), past = [], future = [];
  const trim = () => {
    let bytes = 0;
    past = past.slice(-40).reverse().filter(s => (bytes += s.length) <= 16_000_000).reverse();
  };
  return {
    record(value) {
      const next = JSON.stringify(value);
      if (next === current) return;
      past.push(current); trim(); current = next; future = [];
    },
    undo() { if (!past.length) return null; future.push(current); current = past.pop(); return JSON.parse(current); },
    redo() { if (!future.length) return null; past.push(current); trim(); current = future.pop(); return JSON.parse(current); },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
