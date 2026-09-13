import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';
const file = { name: 'AM1_Garden_bees.json', type: 'application/json', size: 12, created: 't', file: { __cruxBinary: { path: 'assets/' + 'd'.repeat(64) + '.bin', kind: 'buffer', type: 'application/json', size: 12 } } };
const session = (over = {}) => ({ version: 1, app: 'am-1', project: { active: { n: 'f:berlin_bees', p: { v: 1, tempo: 120 } }, era: 'mk1', manual: false, patches: { 'Garden bees': { v: 1, tempo: 140 } }, files: [file], saved: 't', ...over } });
test('accepts an empty project and a session', () => {
  validateProject({ version: 1, app: 'am-1', project: null });
  validateProject(session());
  validateProject(session({ active: null, era: null, patches: {}, files: [] }));
});
test('rejects other apps, bad eras, bad banks and bad files', () => {
  assert.throws(() => validateProject({ version: 1, app: 'beepbox', project: null }));
  assert.throws(() => validateProject(session({ era: 'mk3' })), /era/);
  assert.throws(() => validateProject(session({ active: { p: {} } })), /active patch/);
  assert.throws(() => validateProject(session({ patches: { x: 1 } })), /patch bank/);
  assert.throws(() => validateProject(session({ files: [{ ...file, size: 5 }] })), /file reference/);
  assert.throws(() => validateProject(session({ extra: 1 })), /session/);
});
