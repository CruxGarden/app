export const STORAGE_KEYS = ['ketcher_editor_saved_settings', 'ketcher-opts', 'ketcher-tmpls'];
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'ketcher')
    throw new Error('Invalid Ketcher project');
  if (doc.project === null) return;
  if (!doc.project || Object.keys(doc.project).length !== 2)
    throw new Error('Invalid chemistry state');
  for (const key of ['structure', 'storage']) {
    const ref = doc.project[key]?.__cruxBinary;
    if (
      !ref ||
      !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
      ref.kind !== 'buffer' ||
      ref.type !== 'application/json' ||
      !Number.isSafeInteger(ref.size) ||
      ref.size < 1 ||
      ref.size > 32_000_000
    )
      throw new Error('Invalid chemistry Artifact');
  }
}
export function validateState(state) {
  if (!state || !state.structure?.root || !Array.isArray(state.structure.root.nodes))
    throw new Error('Invalid native KET structure');
  if (JSON.stringify(state.structure).length > 30_000_000)
    throw new Error('The chemistry document is too large');
  if (!state.storage || typeof state.storage !== 'object' || Array.isArray(state.storage))
    throw new Error('Invalid editor settings');
  for (const [key, value] of Object.entries(state.storage)) {
    if (!STORAGE_KEYS.includes(key) || typeof value !== 'string' || value.length > 1_000_000)
      throw new Error('Invalid editor setting or template library');
    JSON.parse(value);
  }
}
export function installStorage(initial, changed) {
  const values = new Map(Object.entries(initial || {}));
  const storage = {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(String(key)) ?? null;
    },
    setItem(key, value) {
      key = String(key);
      value = String(value);
      if (values.get(key) === value) return;
      values.set(key, value);
      if (STORAGE_KEYS.includes(key)) changed();
    },
    removeItem(key) {
      if (values.delete(String(key)) && STORAGE_KEYS.includes(key)) changed();
    },
    clear() {
      values.clear();
      changed();
    },
  };
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
  return () => Object.fromEntries([...values].filter(([key]) => STORAGE_KEYS.includes(key)));
}
