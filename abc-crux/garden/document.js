// The Garden document of a Notation Crux: data/project.json holds the score's
// name and its whole ABC text. Plain JavaScript: the host validates with the
// same code.
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const MAX_ABC_CHARS = 200_000;
export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'abc' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw new Error('Invalid notation project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'abc', 'saved'].includes(k)))
    throw new Error('Invalid notation project fields.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw new Error('Name the score (up to 200 characters).');
  if (typeof p.abc !== 'string' || p.abc.length > MAX_ABC_CHARS)
    throw new Error('The ABC text is missing or too large (200 000 characters).');
  if (typeof p.saved !== 'string' || Number.isNaN(Date.parse(p.saved)))
    throw new Error('Invalid save time.');
}
