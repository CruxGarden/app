import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';

const ref = {
  __cruxBinary: {
    path: `assets/${'a'.repeat(64)}.bin`,
    kind: 'buffer',
    type: 'text/plain',
    size: 2_000_000,
  },
};
const project = {
  name: 'Moss Isles',
  seed: '123456789',
  map: ref,
  saved: '2026-09-14T00:00:00.000Z',
};
test('accepts an empty Crux and a saved map (a binary asset reference)', () => {
  validateProject({ version: 1, app: 'fmg', project: null });
  validateProject({ version: 1, app: 'fmg', project });
});
test('refuses other apps, extra fields, bad names, inline or wrong-typed maps and bad times', () => {
  assert.throws(
    () => validateProject({ version: 1, app: 'p5', project: null }),
    /Invalid map project/,
  );
  assert.throws(
    () => validateProject({ version: 1, app: 'fmg', project: { ...project, extra: 1 } }),
    /fields/,
  );
  assert.throws(
    () => validateProject({ version: 1, app: 'fmg', project: { ...project, name: '' } }),
    /Name the map/,
  );
  assert.throws(
    () => validateProject({ version: 1, app: 'fmg', project: { ...project, map: 'x'.repeat(40) } }),
    /map save/,
  );
  assert.throws(
    () =>
      validateProject({
        version: 1,
        app: 'fmg',
        project: { ...project, map: { __cruxBinary: { ...ref.__cruxBinary, type: 'image/png' } } },
      }),
    /map save/,
  );
  assert.throws(
    () => validateProject({ version: 1, app: 'fmg', project: { ...project, saved: 'yesterday' } }),
    /save time/,
  );
});
