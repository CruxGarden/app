import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';
const ref = { __cruxBinary: { path: 'assets/' + 'b'.repeat(64) + '.bin', kind: 'buffer', type: 'application/zip', size: 1234 } };
test('accepts an empty project and a .wick file record', () => {
  validateProject({ version: 1, app: 'wick-editor', project: null });
  validateProject({ version: 1, app: 'wick-editor', project: { file: ref, name: 'Anim', framerate: 12, width: 720, height: 480, saved: 't' } });
});
test('rejects other apps, bad refs and bad numbers', () => {
  assert.throws(() => validateProject({ version: 1, app: 'pptist', project: null }));
  assert.throws(() => validateProject({ version: 1, app: 'wick-editor', project: { file: { __cruxBinary: { path: 'x', type: 'application/zip', size: 1 } }, name: '', framerate: 12, width: 1, height: 1 } }), /file reference/);
  assert.throws(() => validateProject({ version: 1, app: 'wick-editor', project: { file: ref, name: 'a', framerate: 0, width: 1, height: 1 } }), /framerate/);
  assert.throws(() => validateProject({ version: 1, app: 'wick-editor', project: { file: ref, name: 'a', framerate: 12, width: 1, height: 1, extra: 1 } }));
});
