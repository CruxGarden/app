import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand } from './commands.js';
import { rasterGeometry, rasterSelection, rasterSeed, fillPixels } from './raster.js';

const layer = {
  type: 'image',
  x: 40,
  y: 60,
  width: 200,
  height: 100,
  width_original: 20,
  height_original: 20,
  rotate: 0,
};
const pixels = (values, width) => ({
  width,
  height: values.length / width,
  data: new Uint8ClampedArray(values.flatMap((v) => [v, v, v, 255])),
});
const colors = (image) => Array.from(image.data).filter((_, i) => i % 4 === 0);

test('raster coordinates handle translated nonuniformly scaled layers without mutating selection', () => {
  const selection = { x: 35, y: 85, width: 66, height: 10 };
  assert.deepEqual(rasterSelection(layer, selection), { x: 0, y: 5, width: 7, height: 2 });
  assert.equal(selection.width, 66);
  assert.deepEqual(rasterSeed(layer, { x: 70, y: 95 }), { x: 3, y: 7 });
  assert.throws(() => rasterSelection(layer, { x: 0, y: 0, width: 2, height: 2 }), /overlap/);
  assert.throws(() => rasterSeed(layer, { x: 240, y: 60 }), /inside/);
  assert.throws(() => rasterGeometry({ ...layer, rotate: 30 }), /unrotated/);
  assert.throws(() => rasterGeometry({ ...layer, type: 'text' }), /raster/);
});

test('contiguous fill includes an isolated seed but does not cross a boundary or wrap rows', () => {
  const image = pixels([0, 255, 0, 255, 0, 255], 3);
  fillPixels(image, { x: 2, y: 0 }, '#ff0000');
  assert.deepEqual(colors(image), [0, 255, 255, 255, 0, 255]);
  assert.deepEqual(Array.from(image.data.slice(8, 12)), [255, 0, 0, 255]);
  const connected = pixels([0, 0, 255, 0, 255, 0], 3);
  fillPixels(connected, { x: 0, y: 0 }, '#640000');
  assert.deepEqual(colors(connected), [100, 100, 255, 100, 255, 0]);
});

test('global fill uses seed tolerance and selection fill touches only the specified rectangle', () => {
  const image = pixels([0, 10, 30, 0], 2);
  fillPixels(image, { x: 0, y: 0 }, '#640000', 100, 5, true);
  assert.deepEqual(colors(image), [100, 100, 30, 100]);
  const selected = pixels([0, 0, 0, 0], 2);
  fillPixels(selected, null, '#ff0000', 50, 0, false, { x: 1, y: 0, width: 1, height: 2 });
  assert.deepEqual(colors(selected), [0, 128, 0, 128]);
  assert.deepEqual(Array.from(selected.data.slice(4, 8)), [128, 0, 0, 255]);
});

test('transparent fill ignores hidden RGB and composites partial opacity correctly', () => {
  const image = {
    width: 3,
    height: 1,
    data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0, 255, 255, 255, 255]),
  };
  fillPixels(image, { x: 0, y: 0 }, '#123456', 50);
  assert.deepEqual(Array.from(image.data), [18, 52, 86, 128, 18, 52, 86, 128, 255, 255, 255, 255]);
});

test('rejects incomplete, ambiguous or unbounded raster commands before editing', () => {
  for (const value of [
    { op: 'selection', id: 1, action: 'set', x: 0, y: 0 },
    { op: 'selection', id: 1, action: 'clear', width: 10 },
    { op: 'erase', id: 1, mode: 'stroke', points: [[0, 0]] },
    { op: 'erase', id: 1, mode: 'selection', points: [[0, 0]] },
    { op: 'erase', id: 1, mode: 'stroke', points: [[0, 0]], size: 12, opacity: -1 },
    { op: 'fill', id: 1, mode: 'contiguous', color: '#123456' },
    { op: 'fill', id: 1, mode: 'global', x: 0, y: 0, color: '#123456', tolerance: 101 },
    { op: 'fill', id: 1, mode: 'selection', x: 0, color: '#123456' },
    { op: 'fill', id: 1, mode: 'selection' },
  ])
    assert.throws(() => validateCommand(value), JSON.stringify(value));
  assert.doesNotThrow(() =>
    validateCommand({ op: 'erase', id: 1, mode: 'stroke', points: [[0, 0]], size: 5 }),
  );
});
