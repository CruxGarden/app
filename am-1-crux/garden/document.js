// The Garden document of an AM-1 Crux: the instrument's own session (active patch,
// circuit era, manual flag, saved-patch bank) and the files it made (bounces, exported patches).
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'am-1' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid AM-1 project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['active', 'era', 'manual', 'patches', 'files', 'saved'].includes(k))) throw Error('Invalid AM-1 session.');
  if (p.active !== null && (!object(p.active) || typeof p.active.n !== 'string' || !object(p.active.p))) throw Error('Invalid active patch.');
  if (p.era !== null && p.era !== 'mk1' && p.era !== 'mk2') throw Error('Invalid circuit era.');
  if (typeof p.manual !== 'boolean') throw Error('Invalid manual flag.');
  if (!object(p.patches) || Object.keys(p.patches).length > 1000 || Object.values(p.patches).some((v) => !object(v))) throw Error('Invalid patch bank.');
  if (!Array.isArray(p.files) || p.files.length > 1000) throw Error('Invalid file list.');
  for (const f of p.files) {
    const ref = object(f) && object(f.file) && f.file.__cruxBinary;
    if (!ref || typeof f.name !== 'string' || !f.name || f.name.length > 200 || !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) || ref.size !== f.size || typeof f.type !== 'string' || typeof f.created !== 'string')
      throw Error('Invalid file reference.');
  }
  if (JSON.stringify(p).length > 3_000_000) throw Error('The AM-1 session is too large.');
}
