// The Garden document of a layout Crux: the name, the page choice and the pdfme template.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'pdfme' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid layout project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'page', 'template', 'saved'].includes(k))) throw Error('Invalid layout record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid layout name.');
  if (typeof p.page !== 'string' || !/^[a-z0-9-]{1,40}$/.test(p.page)) throw Error('Invalid page choice.');
  const t = p.template;
  if (!object(t) || !Array.isArray(t.schemas) || t.schemas.length > 100 || !t.schemas.every((page) => Array.isArray(page) && page.length <= 500))
    throw Error('Invalid layout template.');
  if (JSON.stringify(t).length > 24_000_000) throw Error('The layout is too large (24 MB).');
}
