export const STORAGE_KEYS = [
  'game_data',
  'custom_font',
  'engine_version',
  'panel_prefs',
  'editor_language',
  'exportSettings',
];
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'bitsy') throw new Error('Choose a Bitsy project.');
  if (doc.project === null) return;
  const storage = doc.project.storage;
  if (!storage || typeof storage !== 'object' || Array.isArray(storage))
    throw new Error('Choose a Bitsy save.');
  for (const [key, value] of Object.entries(storage)) {
    if (!STORAGE_KEYS.includes(key) || typeof value !== 'string')
      throw new Error('Unsupported Bitsy setting.');
    JSON.parse(value);
  }
  const game = JSON.parse(storage.game_data || 'null');
  if (typeof game !== 'string' || !game.includes('# BITSY VERSION') || game.length > 2_000_000)
    throw new Error('Choose native Bitsy game data, up to 2 MB.');
}
