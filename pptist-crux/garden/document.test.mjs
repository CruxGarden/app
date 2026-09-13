import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject, mediaRefs } from './document.js';
const base = { title: 'Deck', width: 1000, height: 562.5, theme: { themeColors: [] }, slides: [{ id: 'a', elements: [] }] };
test('accepts an empty project and a presentation with media references', () => {
  validateProject({ version: 1, app: 'pptist', project: null });
  const ref = { __cruxBinary: { path: 'assets/' + 'a'.repeat(64) + '.bin', kind: 'buffer', type: 'image/png', size: 12 } };
  const p = { ...base, slides: [{ id: 'a', elements: [{ type: 'image', src: ref }], background: { type: 'image', image: { src: ref, size: 'cover' } } }] };
  validateProject({ version: 1, app: 'pptist', project: p });
  assert.equal(mediaRefs(p).length, 2);
});
test('rejects other apps, bad slides, bad refs and oversized JSON', () => {
  assert.throws(() => validateProject({ version: 1, app: 'kan', project: null }));
  assert.throws(() => validateProject({ version: 1, app: 'pptist', project: { ...base, slides: [{ elements: [] }] } }), /Invalid slide/);
  assert.throws(() => validateProject({ version: 1, app: 'pptist', project: { ...base, extra: 1 } }));
  const bad = { ...base, slides: [{ id: 'a', elements: [{ type: 'image', src: { __cruxBinary: { path: 'x', type: 'image/png', size: 1 } } }] }] };
  assert.throws(() => validateProject({ version: 1, app: 'pptist', project: bad }), /media reference/);
  const huge = { ...base, slides: [{ id: 'a', elements: [{ type: 'text', content: 'x'.repeat(3_600_000) }] }] };
  assert.throws(() => validateProject({ version: 1, app: 'pptist', project: huge }), /too large/);
});
