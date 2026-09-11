export const STORAGE_KEYS = [
  'codeStore',
  'autoHistoryStore',
  'manualHistoryStore',
  'autoHistoryMode',
  'migrations',
  'hiddenPromotions',
];
export function validateProject(doc) {
  if (!doc || doc.version !== 1 || doc.app !== 'mermaid')
    throw new Error('Choose a Mermaid Live Editor project.');
  if (doc.project === null) return;
  const s = doc.project.storage;
  if (!s || typeof s !== 'object' || Array.isArray(s))
    throw new Error('Choose native Mermaid editor data.');
  for (const [k, v] of Object.entries(s)) {
    if (!STORAGE_KEYS.includes(k) || typeof v !== 'string')
      throw new Error('Unsupported Mermaid setting.');
    JSON.parse(v);
  }
  const state = JSON.parse(s.codeStore || 'null');
  if (
    !state ||
    typeof state.code !== 'string' ||
    state.code.length > 1_000_000 ||
    typeof state.mermaid !== 'string'
  )
    throw new Error('Choose Mermaid source and configuration.');
  // Invalid diagram/config text is an editable draft, not a failed save.
  for (const key of ['autoHistoryStore', 'manualHistoryStore'])
    if (s[key] && !Array.isArray(JSON.parse(s[key])))
      throw new Error('Choose a valid diagram history.');
}
