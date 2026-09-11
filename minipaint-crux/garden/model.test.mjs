import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './model.js';
const project = () => ({
  version: 1,
  app: 'minipaint',
  project: {
    info: { width: 800, height: 600, version: '4.14.3' },
    layers: [{ id: 1, type: 'image', width_original: 800, height_original: 600 }],
    data: [{ id: 1, data: { __cruxBinary: { path: 'assets/' + 'a'.repeat(64) + '.bin' } } }],
  },
});
test('preserves native layers while requiring separate image references', () => {
  assert.doesNotThrow(() => validateProject(project()));
  const missing = project();
  missing.project.data = [];
  assert.throws(() => validateProject(missing), /missing its pixels/);
  const inline = project();
  inline.project.data[0].data = 'data:image/png;base64,AAAA';
  assert.throws(() => validateProject(inline), /raster reference/);
});
test('rejects oversized canvases, raster allocations and duplicate layers before hydration', () => {
  const huge = project();
  huge.project.info.width = 100000;
  assert.throws(() => validateProject(huge), /canvas/);
  const raster = project();
  raster.project.layers[0].width_original = 100000;
  assert.throws(() => validateProject(raster), /raster layer/);
  const duplicate = project();
  duplicate.project.layers.push({ ...duplicate.project.layers[0] });
  assert.throws(() => validateProject(duplicate), /unique/);
});
