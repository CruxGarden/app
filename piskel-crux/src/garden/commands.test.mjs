import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, inspectPixels } from './commands.js';
import { spriteCommands } from './sprite.js';

test('rejects malformed batches, duplicate coordinates and excessive inspection', () => {
  const paint = {
    op: 'paint',
    layerIndex: 0,
    frameIndex: 0,
    expectedHash: '1-0',
    pixels: [{ x: 1, y: 1, color: '#ff0000' }],
  };
  assert.equal(validateCommand(paint).op, 'paint');
  for (const v of [
    { ...paint, extra: true },
    { ...paint, expectedHash: '' },
    { ...paint, pixels: [...paint.pixels, ...paint.pixels] },
    { ...paint, pixels: [{ x: 1, y: 1, color: 'url(remote)' }] },
    { op: 'inspect', width: 33 },
    { op: 'insert-frame' },
    { op: 'delete-frame', frameId: '-1' },
    { op: 'save-sheet', label: ' ' },
  ])
    assert.throws(() => validateCommand(v));
});

test('bounded pixel inspection preserves orientation, transparency and partial alpha', () => {
  const region = inspectPixels(
    {
      getPixel: (x, y) =>
        [
          [0xff0000ff, 0],
          [0x8000ff00, 0xff0000ff],
        ][y][x],
    },
    0,
    0,
    2,
    2,
  );
  assert.deepEqual(region.palette, ['#ff0000', 'transparent', '#00ff0080']);
  assert.deepEqual(region.rows, [
    [0, 1],
    [2, 0],
  ]);
});

test('validates the entire edit and checks the native frame again after pre-save', async () => {
  let version = 0,
    mutations = 0;
  const frame = {
    getHash: () => `1-${version}`,
    containsPixel: (x, y) => x < 32 && y < 32,
    setPixel: () => mutations++,
  };
  const app = { piskelController: { getLayerAt: () => ({ getFrameAt: () => frame }) } };
  const { prepare } = spriteCommands(app, {}, () => {});
  const value = {
    op: 'paint',
    layerIndex: 0,
    frameIndex: 0,
    expectedHash: '1-0',
    pixels: [{ x: 1, y: 1, color: '#ffffff' }],
  };
  assert.throws(
    () => prepare({ ...value, pixels: [...value.pixels, { x: 32, y: 1, color: '#ffffff' }] }),
    /inside/,
  );
  const edit = prepare(value);
  version++;
  await assert.rejects(edit.apply(), /changed/);
  assert.equal(mutations, 0);
});
