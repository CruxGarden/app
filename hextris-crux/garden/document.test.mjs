import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';
test('accepts empty and saved Hextris records', () => {
  validateProject({ version: 1, app: 'hextris', project: null });
  validateProject({ version: 1, app: 'hextris', project: { saveState: '{}', highscores: '[120,40]', saved: 't' } });
});
test('rejects other apps, bad scores and oversized state', () => {
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: null }));
  assert.throws(() => validateProject({ version: 1, app: 'hextris', project: { saveState: '{}', highscores: '{"a":1}' } }), /high scores/);
  assert.throws(() => validateProject({ version: 1, app: 'hextris', project: { saveState: 'x'.repeat(2_000_001), highscores: '[]' } }), /save state/);
  assert.throws(() => validateProject({ version: 1, app: 'hextris', project: { saveState: '{}', highscores: '[]', extra: 1 } }));
});
