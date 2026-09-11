import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, validateState, installStorage } from './model.js';
test('rejects corrupt native state and browser keys outside the portable settings/library', () => {
  const state = { structure: { root: { nodes: [] } }, storage: { 'ketcher-tmpls': '[]' } };
  validateState(state);
  assert.throws(() => validateState({ ...state, structure: {} }));
  assert.throws(() => validateState({ ...state, storage: { other: '{}' } }));
  const ref = {
    __cruxBinary: {
      path: `assets/${'a'.repeat(64)}.bin`,
      kind: 'buffer',
      type: 'application/json',
      size: 40,
    },
  };
  validateProject({ version: 1, app: 'ketcher', project: { structure: ref, storage: ref } });
  assert.throws(() => validateProject({ version: 1, app: 'ketcher', project: { structure: ref } }));
});
test('native settings and templates use isolated memory and report changes', () => {
  global.window = {};
  let changes = 0;
  const capture = installStorage({ 'ketcher-opts': '{"bondLength":40}' }, () => changes++);
  window.localStorage.setItem('ketcher-tmpls', '[{"name":"Example"}]');
  window.localStorage.setItem('ketcher-tmpls', '[{"name":"Example"}]');
  window.localStorage.setItem('other', 'transient');
  assert.equal(changes, 1);
  assert.deepEqual(capture(), {
    'ketcher-opts': '{"bondLength":40}',
    'ketcher-tmpls': '[{"name":"Example"}]',
  });
  const second = installStorage({}, () => {});
  assert.deepEqual(second(), {});
  assert.equal(window.localStorage.getItem('ketcher-tmpls'), null);
  delete global.window;
});
