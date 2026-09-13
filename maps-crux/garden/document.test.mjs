import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';
const good = { name: 'Walk', style: 'liberty', view: { center: [-0.1, 51.5], zoom: 12 }, features: [
  { type: 'Feature', id: 'a', geometry: { type: 'Point', coordinates: [-0.1, 51.5] }, properties: { title: 'Start', color: '#112233', mode: 'point' } },
  { type: 'Feature', id: 'b', geometry: { type: 'LineString', coordinates: [[-0.1, 51.5], [-0.2, 51.6]] }, properties: {} },
  { type: 'Feature', id: 'c', geometry: { type: 'Polygon', coordinates: [[[-0.1, 51.5], [-0.2, 51.6], [-0.3, 51.5], [-0.1, 51.5]]] }, properties: {} },
], saved: 'x' };
test('a saved map validates', () => {
  validateProject({ version: 1, app: 'maps', project: null });
  validateProject({ version: 1, app: 'maps', project: good });
});
test('a stranger’s document is refused', () => {
  assert.throws(() => validateProject({ version: 1, app: 'pdfme', project: null }), /Invalid map project/);
  assert.throws(() => validateProject({ version: 1, app: 'maps', project: { ...good, style: 'satellite' } }), /Invalid basemap/);
  assert.throws(() => validateProject({ version: 1, app: 'maps', project: { ...good, features: [{ type: 'Feature', id: 'z', geometry: { type: 'Point', coordinates: [500, 0] }, properties: {} }] } }), /Invalid place/);
  assert.throws(() => validateProject({ version: 1, app: 'maps', project: { ...good, features: [{ ...good.features[0], properties: { color: 'red' } }] } }), /Invalid place colour/);
});
