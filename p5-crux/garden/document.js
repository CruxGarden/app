// The Garden document of a sketch Crux: a name and the seed the sketch runs with (the sketch itself is sketch.js).
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'p5' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid sketch project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'seed', 'saved'].includes(k))) throw Error('Invalid sketch record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid sketch name.');
  if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 999999999) throw Error('Invalid sketch seed.');
  if (p.saved !== undefined && typeof p.saved !== 'string') throw Error('Invalid sketch record.');
}
