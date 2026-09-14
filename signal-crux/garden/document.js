// The Garden document of a Song Crux (Signal): data/project.json holds the
// song's name and a reference to its Standard MIDI File, written through the
// host as a Garden binary asset, so the Crux, its history and its archives
// carry the song without the app's browser storage. Plain JavaScript: the host
// validates with the same code.
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export const MAX_MIDI_BYTES = 16_000_000;

export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'signal' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw new Error('Invalid song project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['name', 'midi', 'saved'].includes(k)))
    throw new Error('Invalid song project fields.');
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 200)
    throw new Error('Name the song (up to 200 characters).');
  const ref = object(p.midi) && object(p.midi.__cruxBinary) ? p.midi.__cruxBinary : null;
  if (
    !ref ||
    Object.keys(p.midi).length !== 1 ||
    !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) ||
    ref.kind !== 'buffer' ||
    ref.type !== 'audio/midi' ||
    !Number.isSafeInteger(ref.size) ||
    ref.size < 14 ||
    ref.size > MAX_MIDI_BYTES ||
    Object.keys(ref).some((k) => !['path', 'kind', 'type', 'size'].includes(k))
  )
    throw new Error('The MIDI file is missing, inline or too large (16 MB).');
  if (typeof p.saved !== 'string' || Number.isNaN(Date.parse(p.saved)))
    throw new Error('Invalid save time.');
}
