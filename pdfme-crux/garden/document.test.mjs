import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProject } from './document.js';
const template = { basePdf: { width: 210, height: 297, padding: [10, 10, 10, 10] }, schemas: [[{ name: 'title', type: 'text', content: 'Open day', position: { x: 10, y: 10 }, width: 100, height: 20 }]] };
test('a saved layout validates', () => {
  validateProject({ version: 1, app: 'pdfme', project: null });
  validateProject({ version: 1, app: 'pdfme', project: { name: 'Poster', page: 'a4-portrait', template, saved: 'x' } });
});
test('a stranger’s document is refused', () => {
  assert.throws(() => validateProject({ version: 1, app: 'formjs', project: null }), /Invalid layout project/);
  assert.throws(() => validateProject({ version: 1, app: 'pdfme', project: { name: 'x', page: 'A4 P', template, saved: 'x' } }), /Invalid page choice/);
  assert.throws(() => validateProject({ version: 1, app: 'pdfme', project: { name: 'x', page: 'a4-portrait', template: { schemas: 'no' }, saved: 'x' } }), /Invalid layout template/);
});
