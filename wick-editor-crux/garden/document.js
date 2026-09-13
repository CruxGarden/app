// The Garden document of a Wick Editor Crux: a reference to the project's own
// .wick file (a zip of project JSON plus assets), stored as a binary Artifact.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'wick-editor' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid Wick Editor project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['file', 'name', 'framerate', 'width', 'height', 'saved'].includes(k)))
    throw Error('Invalid Wick project record.');
  const ref = object(p.file) && p.file.__cruxBinary;
  if (!ref || !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) || ref.type !== 'application/zip' || !Number.isSafeInteger(ref.size) || ref.size <= 0 || ref.size > 256_000_000)
    throw Error('Invalid Wick file reference.');
  if (typeof p.name !== 'string' || p.name.length > 200) throw Error('Invalid project name.');
  for (const k of ['framerate', 'width', 'height']) if (!Number.isFinite(p[k]) || p[k] <= 0) throw Error(`Invalid project ${k}.`);
  if (p.saved !== undefined && typeof p.saved !== 'string') throw Error('Invalid save timestamp.');
}
