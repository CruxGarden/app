// The Garden document of a Model Crux (JSCAD): data/project.json holds the
// model's name and its whole JSCAD source (what the editor shows), so the Crux,
// its history and its archives carry the model without the app's browser
// storage. Plain JavaScript: the host validates with the same code.
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const MAX_SOURCE_CHARS = 400_000;

export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'jscad' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw new Error('Invalid model project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'source', 'saved'].includes(k)))
    throw new Error('Invalid model project fields.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw new Error('Name the model (up to 200 characters).');
  if (typeof p.source !== 'string' || !p.source.trim() || p.source.length > MAX_SOURCE_CHARS)
    throw new Error('The model source is missing or too long (400 000 characters).');
  if (typeof p.saved !== 'string' || Number.isNaN(Date.parse(p.saved)))
    throw new Error('Invalid save time.');
}
