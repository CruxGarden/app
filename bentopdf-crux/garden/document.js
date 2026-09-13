// The Garden document of a BentoPDF Crux: the papers a person loaded into the
// toolkit and every result a tool made from them, each a binary Artifact.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ENTRY_KEYS = [
  'id',
  'name',
  'type',
  'size',
  'pages',
  'source',
  'tool',
  'created',
  'file',
];
export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'bentopdf' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw Error('Invalid BentoPDF project.');
  const p = doc.project;
  if (
    !object(p) ||
    Object.keys(p).some((k) => !['name', 'documents'].includes(k))
  )
    throw Error('Invalid BentoPDF project record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw Error('Invalid project name.');
  if (!Array.isArray(p.documents) || p.documents.length > 5000)
    throw Error('Invalid document list.');
  for (const e of p.documents) {
    if (!object(e) || Object.keys(e).some((k) => !ENTRY_KEYS.includes(k)))
      throw Error('Invalid document entry.');
    if (typeof e.id !== 'string' || !e.id || e.id.length > 40)
      throw Error('Invalid document id.');
    if (typeof e.name !== 'string' || !e.name || e.name.length > 200)
      throw Error('Invalid document name.');
    if (typeof e.type !== 'string' || !e.type || e.type.length > 100)
      throw Error('Invalid document type.');
    if (!Number.isSafeInteger(e.size) || e.size < 0 || e.size > 256_000_000)
      throw Error('Invalid document size.');
    if (e.pages !== null && (!Number.isSafeInteger(e.pages) || e.pages < 0))
      throw Error('Invalid page count.');
    if (!['upload', 'tool', 'agent'].includes(e.source))
      throw Error('Invalid document source.');
    if (typeof e.tool !== 'string' || e.tool.length > 100)
      throw Error('Invalid tool name.');
    if (typeof e.created !== 'string' || e.created.length > 40)
      throw Error('Invalid creation time.');
    const ref = object(e.file) && e.file.__cruxBinary;
    if (
      !ref ||
      !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
      ref.kind !== 'buffer' ||
      typeof ref.type !== 'string' ||
      ref.size !== e.size
    )
      throw Error('Invalid document file reference.');
  }
}
