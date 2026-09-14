import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';

const good = {
  version: 1,
  app: 'jscad',
  project: { name: 'Moss Stone', source: 'const main = () => []\nmodule.exports = { main }', saved: '2026-09-14T00:00:00.000Z' },
};

test('accepts an empty project and a saved model', () => {
  validateProject({ version: 1, app: 'jscad', project: null });
  validateProject(good);
});

test('refuses other apps, unnamed or empty models, stray fields and bad times', () => {
  assert.throws(() => validateProject({ ...good, app: 'abc' }), /Invalid model project/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, name: ' ' } }), /Name the model/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, source: '' } }), /source/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, source: 'x'.repeat(400_001) } }), /source/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, extra: 1 } }), /fields/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, saved: 'never' } }), /save time/);
});
