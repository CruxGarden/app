// The Garden document of a shader Crux: a name and the fragment shader source.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'glsl' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid shader project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'source', 'saved'].includes(k))) throw Error('Invalid shader record.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200) throw Error('Invalid shader name.');
  if (typeof p.source !== 'string' || p.source.length > 200000) throw Error('Invalid shader source.');
  if (p.saved !== undefined && typeof p.saved !== 'string') throw Error('Invalid shader record.');
}
