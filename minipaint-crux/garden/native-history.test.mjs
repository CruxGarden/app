import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Base_action } from '../src/js/actions/base.js';

function filterAction(layer) {
  const source = readFileSync(
    new URL('../src/js/actions/add-layer-filter.js', import.meta.url),
    'utf8',
  )
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export class', 'return class');
  return new Function('app', 'config', 'Base_action', source)(
    { Layers: { get_layer: () => layer }, GUI: { GUI_layers: { render_layers() {} } } },
    { layer },
    Base_action,
  );
}

test('native manual filter update Undo restores that filter and retains the following filter', async () => {
  const layer = {
    id: 3,
    filters: [
      { id: 7, name: 'brightness', params: { value: 10 } },
      { id: 9, name: 'contrast', params: { value: 20 } },
    ],
  };
  const before = structuredClone(layer.filters);
  const Action = filterAction(layer);
  const edit = new Action(3, 'brightness', { value: 35 }, '7');
  await edit.do();
  assert.equal(layer.filters[0].id, 7);
  assert.equal(layer.filters[0].params.value, 35);
  await edit.undo();
  assert.deepEqual(layer.filters, before);
  await edit.do();
  assert.equal(layer.filters[0].params.value, 35);
  assert.deepEqual(layer.filters[1], before[1]);
});

test('native filter insertion keeps identity across Undo/Redo and missing updates refuse unchanged', async () => {
  const layer = { id: 3, filters: [] };
  const Action = filterAction(layer);
  const edit = new Action(3, 'brightness', { value: 35 });
  await edit.do();
  const inserted = structuredClone(layer.filters);
  await edit.undo();
  assert.deepEqual(layer.filters, []);
  await edit.do();
  assert.deepEqual(layer.filters, inserted);
  await assert.rejects(new Action(3, 'brightness', { value: 0 }, -1).do(), /exist/);
  assert.deepEqual(layer.filters, inserted);
});

test('native raster history captures a temporary canvas before reset and retains decoded imported pixels', async () => {
  const source = readFileSync(
    new URL('../src/js/actions/update-layer-image.js', import.meta.url),
    'utf8',
  )
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export class', 'return class');
  const decoded = [];
  const layer = {
    id: 3,
    type: 'image',
    width_original: 20,
    height_original: 10,
    link: {
      src: 'blob:already-revoked',
      async decode() {
        decoded.push(this.src);
      },
    },
  };
  const values = new Map();
  let next = 0;
  const store = {
    async add(value) {
      values.set(++next, value);
      return next;
    },
    async get(id) {
      return values.get(id);
    },
    async delete(id) {
      values.delete(id);
    },
  };
  const Action = new Function(
    'app',
    'config',
    'alertify',
    'image_store',
    'Base_action',
    'document',
    source,
  )({ Layers: { get_layer: () => layer } }, { layer }, { error() {} }, store, Base_action, {
    createElement: () => ({
      getContext: () => ({
        drawImage(image) {
          assert.equal(image, layer.link);
        },
      }),
      toDataURL: () => 'original-decoded-pixels',
    }),
  });
  let pixels = 'new-edited-pixels';
  const edit = new Action({ toDataURL: () => pixels }, 3);
  pixels = 'cleared-canvas';
  await edit.do();
  assert.equal(layer.link.src, 'new-edited-pixels');
  await edit.undo();
  assert.equal(layer.link.src, 'original-decoded-pixels');
  await edit.do();
  assert.equal(layer.link.src, 'new-edited-pixels');
  assert.deepEqual(decoded, ['new-edited-pixels', 'original-decoded-pixels', 'new-edited-pixels']);
  const stable = layer.link.src;
  store.add = async () => {
    throw Error('full');
  };
  await assert.rejects(new Action({ toDataURL: () => 'rejected' }, 3).do(), /Undo history/);
  assert.equal(layer.link.src, stable);
});
