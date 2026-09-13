// The Garden document of a web-synth Crux: the composition exactly as web-synth
// itself defines one, a JSON object of its `localStorage` keys (persistance.ts).
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const MAX_KEYS = 5000;
export const MAX_BYTES = 16_000_000;
export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'web-synth' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw Error('Invalid web-synth project.');
  if (doc.project === null) return;
  if (
    !object(doc.project) ||
    Object.keys(doc.project).some((k) => !['state', 'saved'].includes(k)) ||
    !object(doc.project.state)
  )
    throw Error('Invalid web-synth composition.');
  const entries = Object.entries(doc.project.state);
  if (entries.length > MAX_KEYS) throw Error('The composition has too many entries.');
  let bytes = 0;
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || !key || key.length > 500 || typeof value !== 'string')
      throw Error('Invalid composition entry.');
    bytes += key.length + value.length;
  }
  if (bytes > MAX_BYTES) throw Error('The composition is too large to save.');
  if (doc.project.saved !== undefined && typeof doc.project.saved !== 'string')
    throw Error('Invalid composition timestamp.');
}
