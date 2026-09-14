import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';
test('a saved shader validates', () => {
  validateProject({ version: 1, app: 'glsl', project: null });
  validateProject({ version: 1, app: 'glsl', project: { name: 'Rings', source: 'void main(){}', saved: 'x' } });
});
test('a stranger’s document is refused', () => {
  assert.throws(() => validateProject({ version: 1, app: 'p5', project: null }), /Invalid shader project/);
  assert.throws(() => validateProject({ version: 1, app: 'glsl', project: { name: '', source: '' } }), /Invalid shader name/);
  assert.throws(() => validateProject({ version: 1, app: 'glsl', project: { name: 'Rings', source: 42 } }), /Invalid shader source/);
});
