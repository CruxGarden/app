// The Garden document of a BeepBox Crux: the song exactly as BeepBox shares it,
// the base64 string it puts in the URL hash (SongDocument.ts).
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const MAX_SONG = 2_000_000;
export function validateProject(doc) {
  if (
    !object(doc) ||
    doc.version !== 1 ||
    doc.app !== 'beepbox' ||
    Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k))
  )
    throw Error('Invalid BeepBox project.');
  if (doc.project === null) return;
  if (!object(doc.project) || Object.keys(doc.project).some((k) => !['song', 'saved'].includes(k)))
    throw Error('Invalid BeepBox song record.');
  const { song, saved } = doc.project;
  if (typeof song !== 'string' || !song || song.length > MAX_SONG || !/^[0-9A-Za-z_\-%.~]+$/.test(song))
    throw Error('Invalid BeepBox song.');
  if (saved !== undefined && typeof saved !== 'string') throw Error('Invalid song timestamp.');
}
