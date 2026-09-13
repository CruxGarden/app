import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';
test('a saved recorder record validates', () => {
  validateProject({ version: 1, app: 'recorder', project: null });
  validateProject({ version: 1, app: 'recorder', project: { name: 'Walkthroughs', recordings: [{ id: 'a', label: 'Recording', path: 'exports/abc.webm', mimeType: 'video/webm', size: 10, created: 'x' }], saved: 'x' } });
});
test('a stranger’s document is refused', () => {
  assert.throws(() => validateProject({ version: 1, app: 'maps', project: null }), /Invalid recorder project/);
  assert.throws(() => validateProject({ version: 1, app: 'recorder', project: { name: 'x', recordings: [{ id: 'a', label: 'r', path: 'data/x.webm', mimeType: 'video/webm', size: 1, created: 'x' }], saved: 'x' } }), /Invalid recording/);
});
