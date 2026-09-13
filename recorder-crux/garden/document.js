// The Garden document of a recorder Crux: the Crux's name and the recordings kept as outputs.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'recorder' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid recorder project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'recordings', 'saved'].includes(k))) throw Error('Invalid recorder record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid recorder name.');
  if (!Array.isArray(p.recordings) || p.recordings.length > 1000) throw Error('Invalid recording list.');
  for (const r of p.recordings) {
    if (!object(r) || typeof r.id !== 'string' || typeof r.label !== 'string' || r.label.length > 200 || typeof r.path !== 'string' || !/^exports\/[\w.-]+\.(webm|mp4)$/.test(r.path))
      throw Error('Invalid recording.');
    if (!['video/webm', 'video/mp4'].includes(String(r.mimeType)) || typeof r.size !== 'number' || typeof r.created !== 'string') throw Error('Invalid recording.');
  }
}
