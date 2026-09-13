// The Garden document of a PPTist Crux: the presentation as PPTist's own JSON
// export defines it (title, width, height, theme, slides), with pictures, video
// and audio stored as fingerprinted binary Artifacts instead of data URLs.
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const MAX_SLIDES = 500;
export const MAX_JSON = 3_500_000; // under the host's 4 MB native document limit; media lives outside
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'pptist' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid PPTist project.');
  if (doc.project === null) return;
  const p = doc.project;
  if (!object(p) || Object.keys(p).some((k) => !['title', 'width', 'height', 'theme', 'slides', 'saved'].includes(k)))
    throw Error('Invalid PPTist presentation record.');
  if (typeof p.title !== 'string' || p.title.length > 500) throw Error('Invalid presentation title.');
  if (!Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width <= 0 || p.height <= 0) throw Error('Invalid slide size.');
  if (!object(p.theme)) throw Error('Invalid theme.');
  if (!Array.isArray(p.slides) || p.slides.length > MAX_SLIDES) throw Error('Invalid slides.');
  for (const slide of p.slides) {
    if (!object(slide) || typeof slide.id !== 'string' || !slide.id || !Array.isArray(slide.elements)) throw Error('Invalid slide.');
    for (const el of slide.elements) if (!object(el) || typeof el.type !== 'string') throw Error('Invalid slide element.');
  }
  if (p.saved !== undefined && typeof p.saved !== 'string') throw Error('Invalid save timestamp.');
  if (JSON.stringify(p).length > MAX_JSON) throw Error('The presentation is too large to save; media should be Artifacts, not data URLs.');
  for (const ref of mediaRefs(p)) {
    if (!object(ref) || !/^assets\/[a-f0-9]{64}\.bin$/.test(ref.path) || typeof ref.type !== 'string' || !Number.isSafeInteger(ref.size) || ref.size <= 0)
      throw Error('Invalid media reference.');
  }
}
/** Every media reference in a saved presentation (background images and image/video/audio elements). */
export function mediaRefs(p) {
  const refs = [];
  for (const slide of p.slides ?? []) {
    const bg = slide.background?.image;
    if (bg && object(bg.src) && bg.src.__cruxBinary) refs.push(bg.src.__cruxBinary);
    for (const el of slide.elements ?? []) {
      if (['image', 'video', 'audio'].includes(el.type) && object(el.src) && el.src.__cruxBinary) refs.push(el.src.__cruxBinary);
      if (el.type === 'video' && object(el.poster) && el.poster.__cruxBinary) refs.push(el.poster.__cruxBinary);
    }
  }
  return refs;
}
