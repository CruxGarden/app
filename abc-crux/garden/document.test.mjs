import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';
const project = { name: 'Moss on the Stone', abc: 'X:1\nT:Moss\nK:D\nD2|', saved: '2026-09-14T00:00:00.000Z' };
test('accepts an empty Crux and a saved score', () => {
  validateProject({ version: 1, app: 'abc', project: null });
  validateProject({ version: 1, app: 'abc', project });
});
test('refuses other apps, extra fields, bad names, missing text and bad times', () => {
  assert.throws(() => validateProject({ version: 1, app: 'p5', project: null }), /Invalid notation project/);
  assert.throws(() => validateProject({ version: 1, app: 'abc', project: { ...project, extra: 1 } }), /fields/);
  assert.throws(() => validateProject({ version: 1, app: 'abc', project: { ...project, name: '' } }), /Name the score/);
  assert.throws(() => validateProject({ version: 1, app: 'abc', project: { ...project, abc: 5 } }), /ABC text/);
  assert.throws(() => validateProject({ version: 1, app: 'abc', project: { ...project, saved: 'x' } }), /save time/);
});
