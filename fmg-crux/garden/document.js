// The Garden document of a Fantasy Map Crux: data/project.json holds the map's
// name and the whole .map save text (what "Save to machine" downloads), so the
// Crux, its history and its archives carry the world without the app's
// browser storage. Plain JavaScript: the host validates with the same code.
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const MAX_MAP_CHARS = 48_000_000;

export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'fmg' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw new Error('Invalid map project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'seed', 'map', 'saved'].includes(k)))
    throw new Error('Invalid map project fields.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw new Error('Name the map (up to 200 characters).');
  if (typeof p.seed !== 'string' || p.seed.length > 64) throw new Error('Invalid map seed.');
  // The save text is a Garden binary asset (data/assets/<sha256>.bin) written through the host,
  // never inline: a .map runs to megabytes and the project metadata is capped at 4 MB.
  const ref = object(p.map) && object(p.map.__cruxBinary) ? p.map.__cruxBinary : null;
  if (
    !ref ||
    Object.keys(p.map).length !== 1 ||
    !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
    ref.kind !== 'buffer' ||
    ref.type !== 'text/plain' ||
    !Number.isSafeInteger(ref.size) ||
    ref.size < 10 ||
    ref.size > MAX_MAP_CHARS ||
    Object.keys(ref).some((k) => !['path', 'kind', 'type', 'size'].includes(k))
  )
    throw new Error('The map save is missing, inline or too large (48 MB).');
  if (typeof p.saved !== 'string' || Number.isNaN(Date.parse(p.saved)))
    throw new Error('Invalid save time.');
}
