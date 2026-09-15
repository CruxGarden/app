import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from './commands.js';
import { brushLayer, revisedFilters, duplicateLayer, cropLayers } from './editing.js';

test('native brush coordinates preserve separate points and a single dot', () => {
  const command = validateCommand({
    op: 'add-brush',
    size: 12,
    points: [
      [100, 90],
      [130, 110],
    ],
  });
  const layer = brushLayer(command);
  assert.deepEqual([layer.x, layer.y, layer.width, layer.height], [100, 90, 30, 20]);
  assert.deepEqual(layer.data, [
    [
      [0, 0, 12],
      [30, 20, 12],
    ],
  ]);
  assert.deepEqual(brushLayer({ size: 5, points: [[-2, 3]] }).data, [[[0, 0, 5]]]);
  layer.data[0][0][0] = 40;
  assert.deepEqual(command.points[0], [100, 90]);
});

test('filter editing preserves other filters, values, order and original undo baseline', () => {
  const layer = {
    type: 'image',
    filters: [
      { id: 7, name: 'brightness', params: { value: 10 } },
      { id: 9, name: 'contrast', params: { value: 20 } },
    ],
  };
  const original = structuredClone(layer);
  const revised = revisedFilters(layer, {
    action: 'update',
    filterId: 7,
    filter: 'brightness',
    value: 35,
  });
  assert.equal(revised[0].params.value, 35);
  assert.deepEqual(revised[1], layer.filters[1]);
  assert.deepEqual(layer, original);
  const removed = revisedFilters(layer, { action: 'remove', filterId: 7 });
  assert.deepEqual(removed, [layer.filters[1]]);
  const added = revisedFilters(layer, { action: 'add', filter: 'sepia', value: 40 });
  assert.deepEqual(added.slice(0, 2), layer.filters);
  assert.notEqual(added[2].id, 7);
  assert.throws(() => revisedFilters(layer, { action: 'remove', filterId: 99 }));
  assert.throws(() =>
    revisedFilters(layer, { action: 'update', filterId: 7, filter: 'contrast', value: 0 }),
  );
  // Older native dialog edits persisted data-attribute IDs as strings.
  const legacy = { type: 'image', filters: [{ id: '1', name: 'sepia', params: { value: 10 } }] };
  assert.deepEqual(revisedFilters(legacy, { action: 'remove', filterId: 1 }), []);
  assert.equal(revisedFilters(legacy, { action: 'add', filter: 'brightness', value: 5 })[1].id, 2);
});

test('duplication isolates editable data and image elements without copying private caches', () => {
  const source = {
    id: 3,
    order: 2,
    type: 'image',
    name: 'Photo',
    x: 20,
    y: 30,
    _cache: 'private',
    link_canvas: 'draft',
    filters: [{ id: 1, name: 'sepia', params: { value: 10 } }],
    link: { cloneNode: () => ({ src: 'copy' }) },
  };
  const duplicate = duplicateLayer(source);
  assert.equal(duplicate.x, 20);
  assert.equal(duplicate.id, undefined);
  assert.equal(duplicate._cache, undefined);
  assert.equal(duplicate.link_canvas, undefined);
  assert.notEqual(duplicate.link, source.link);
  duplicate.filters[0].params.value = 99;
  assert.equal(source.filters[0].params.value, 10);
});

test('crop retains hidden and off-canvas content through native position updates', () => {
  const config = { WIDTH: 800, HEIGHT: 600, layers: [{ id: 1, x: 10, y: -5, visible: false }] };
  assert.deepEqual(cropLayers(config, { x: 20, y: 30, width: 600, height: 400 }), [
    { id: 1, settings: { x: -10, y: -35 } },
  ]);
  assert.equal(config.layers[0].x, 10);
  assert.throws(() => cropLayers(config, { x: 700, y: 0, width: 200, height: 10 }));
});

test('rejects malformed or oversized editing commands before mutation', () => {
  for (const value of [
    { op: 'add-brush', size: 12, points: [] },
    { op: 'add-brush', size: 12, points: [[1, NaN]] },
    { op: 'add-brush', size: 12, points: [[1, 2, 3]] },
    { op: 'add-brush', size: 12, points: Array(1001).fill([1, 2]) },
    { op: 'add-brush', size: 0, points: [[1, 2]] },
    { op: 'crop-canvas', x: -1, y: 0, width: 100, height: 100 },
    { op: 'crop-canvas', x: 0, y: 0, width: 10.5, height: 100 },
    { op: 'edit-filter', id: 1, action: 'add', filter: 'blur', value: 51 },
    { op: 'edit-filter', id: 1, action: 'add', filter: 'constructor', value: 1 },
    { op: 'edit-filter', id: 1, action: 'add', filter: 'contrast', value: 0, filterId: 1 },
    { op: 'edit-filter', id: 1, action: 'remove', filterId: 2, value: 5 },
    { op: 'edit-filter', id: 1, action: 'update', filter: 'contrast', value: 0 },
    { op: 'history', direction: 'clear' },
  ])
    assert.throws(() => validateCommand(value), JSON.stringify(value));
});
