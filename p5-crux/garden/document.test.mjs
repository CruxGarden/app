import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';
test('a saved sketch validates', () => {
  validateProject({ version: 1, app: 'p5', project: null });
  validateProject({ version: 1, app: 'p5', project: { name: 'Flow', seed: 42, saved: 'x' } });
});
test('a stranger’s document is refused', () => {
  assert.throws(() => validateProject({ version: 1, app: 'maps', project: null }), /Invalid sketch project/);
  assert.throws(() => validateProject({ version: 1, app: 'p5', project: { name: '', seed: 1 } }), /Invalid sketch name/);
  assert.throws(() => validateProject({ version: 1, app: 'p5', project: { name: 'Flow', seed: -1 } }), /Invalid sketch seed/);
  assert.throws(() => validateProject({ version: 1, app: 'p5', project: { name: 'Flow', seed: 1.5 } }), /Invalid sketch seed/);
});
