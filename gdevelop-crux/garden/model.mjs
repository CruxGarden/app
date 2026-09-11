export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'gdevelop') throw new Error('Invalid GDevelop Garden document.');
  if (doc.project === null) return;
  if (!doc.project || typeof doc.project !== 'object' || Array.isArray(doc.project)) throw new Error('Invalid GDevelop project records.');
  const keys = Object.keys(doc.project);
  if (!keys.includes('document') || !keys.includes('preferences')) throw new Error('Missing GDevelop document or preferences.');
  for (const value of Object.values(doc.project)) {
    const ref = value?.__cruxBinary;
    if (!ref || !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) || ref.kind !== 'buffer' || ref.type !== 'application/json' || !Number.isSafeInteger(ref.size) || ref.size < 1 || ref.size > 64 * 1024 * 1024) throw new Error('Invalid GDevelop component reference.');
  }
  if (keys.length > 4002 || keys.some(key => !['document', 'preferences'].includes(key) && !/^media-[a-f0-9]{64}$/.test(key))) throw new Error('Invalid GDevelop record keys.');
}
export function memoryStorage(initial = {}, changed = () => {}) {
  const values = new Map(Object.entries(initial));
  return {
    storage: {
      get length() { return values.size; },
      key(index) { return [...values.keys()][index] ?? null; },
      getItem(key) { return values.get(String(key)) ?? null; },
      setItem(key, value) { values.set(String(key), String(value)); changed(); },
      removeItem(key) { values.delete(String(key)); changed(); },
      clear() { values.clear(); changed(); },
    },
    snapshot() { return Object.fromEntries([...values].filter(([key]) => key === 'gd-preferences')); },
  };
}
export function validateNativeDocument(document) {
  if (!document || !Array.isArray(document.layouts) || !document.properties) throw new Error('Not a native GDevelop project.');
  // The optional third-party Spine runtime is not supplied by this fork.
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (typeof value.type === 'string' && value.type.startsWith('SpineObject::')) throw new Error('Spine objects are not supported in this Garden edition.');
    Object.values(value).forEach(visit);
  };
  visit(document);
}
