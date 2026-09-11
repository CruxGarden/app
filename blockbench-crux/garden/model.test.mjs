import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, packModels, unpackModel, validateProject } from './model.js';
test('native media and animation survive packing, with unchanged media shared between models', async () => {
  const a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    image = 'data:image/png;base64,AQID';
  const model = {
    meta: { format_version: '5.0' },
    name: 'Lantern',
    textures: [{ source: image }],
    animations: [
      { name: 'sway', animators: { bone: { keyframes: [{ time: 0, value: [1, 2, 3] }] } } },
    ],
  };
  const index = { models: [a, b], open: [a], active: a };
  const first = await packModels(
    new Map([
      [a, model],
      [b, model],
    ]),
    index,
    {},
  );
  assert.equal(Object.keys(first).filter((k) => k.startsWith('asset-')).length, 1);
  assert.deepEqual(unpackModel(first['model-' + a], first), model);
  const second = await packModels(
    new Map([
      [a, { ...model, name: 'Renamed' }],
      [b, model],
    ]),
    index,
    {},
  );
  const key = Object.keys(first).find((k) => k.startsWith('asset-'));
  assert.equal(first[key], second[key]);
  assert.deepEqual(first['model-' + b], second['model-' + b]);
  delete first[key];
  assert.throws(() => unpackModel(first['model-' + a], first), /missing/);
});
test('memory storage supports native property syntax while excluding plugin state', () => {
  let dirty = 0;
  const { storage, preferences } = memoryStorage({}, () => dirty++);
  storage.settings = '{}';
  storage.setItem('colors', '["red"]');
  storage['StateMemory.installed_plugins'] = '["remote"]';
  assert.equal(storage.getItem('settings'), '{}');
  assert.equal(storage.length, 3);
  assert.equal(Object.keys(storage).length, 3);
  assert.deepEqual(preferences(), { settings: '{}', colors: '["red"]' });
  delete storage.colors;
  assert.equal(storage.getItem('colors'), null);
  assert.equal(dirty, 4);
  storage.clear();
  assert.equal(storage.length, 0);
});
test('rejects malformed manifests and traversal asset references', () => {
  assert.throws(() =>
    validateProject({
      version: 1,
      app: 'blockbench',
      project: { index: { models: ['bad'], open: [], active: null } },
    }),
  );
  assert.throws(() =>
    validateProject({
      version: 1,
      app: 'blockbench',
      project: { preferences: { 'StateMemory.installed_plugins': '[]' } },
    }),
  );
  assert.throws(() =>
    validateProject({
      version: 1,
      app: 'blockbench',
      project: {
        index: {
          __cruxBinary: {
            path: '../outside.bin',
            kind: 'buffer',
            type: 'application/json',
            size: 4,
          },
        },
      },
    }),
  );
});
