// The Garden document of a Hextris Crux: the game's own saved state and high
// scores, exactly the two localStorage strings Hextris writes (js/save-state.js).
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateProject(doc) {
  if (!object(doc) || doc.version !== 1 || doc.app !== 'hextris' || Object.keys(doc).some((k) => !['version', 'app', 'project'].includes(k)))
    throw Error('Invalid Hextris project.');
  if (doc.project === null) return;
  if (!object(doc.project) || Object.keys(doc.project).some((k) => !['saveState', 'highscores', 'saved'].includes(k)))
    throw Error('Invalid Hextris record.');
  const { saveState, highscores, saved } = doc.project;
  if (typeof saveState !== 'string' || saveState.length > 2_000_000) throw Error('Invalid Hextris save state.');
  if (typeof highscores !== 'string' || highscores.length > 10_000) throw Error('Invalid Hextris high scores.');
  try {
    const parsed = JSON.parse(highscores);
    if (!Array.isArray(parsed) || parsed.some((n) => typeof n !== 'number')) throw 0;
  } catch {
    throw Error('Invalid Hextris high scores.');
  }
  if (saved !== undefined && typeof saved !== 'string') throw Error('Invalid save timestamp.');
}
