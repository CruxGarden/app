import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateProject, validateTimeline } from './document.js';

const starter = JSON.parse(readFileSync(new URL('../timeline.json', import.meta.url), 'utf8'));
const good = { version: 1, app: 'timeline', project: { name: 'A Garden Year', timeline: starter, saved: '2026-09-14T00:00:00.000Z' } };

test('accepts an empty project, the starter and cosmological years as strings', () => {
  validateProject({ version: 1, app: 'timeline', project: null });
  validateProject(good);
  validateTimeline({ events: [{ start_date: { year: '-13800000000' }, text: { headline: 'Big Bang' } }], scale: 'cosmological' });
  validateTimeline({ events: [], eras: [{ start_date: { year: 600 }, end_date: { year: 650 }, text: { headline: 'Era' } }] });
});

test('refuses events without a year, unknown fields, repeated ids, bad eras and other apps', () => {
  assert.throws(() => validateProject({ ...good, app: 'abc' }), /Invalid timeline project/);
  assert.throws(() => validateTimeline({ events: [{ text: { headline: 'No date' } }] }), /start date/);
  assert.throws(() => validateTimeline({ events: [{ start_date: { year: 2026 }, colour: 'red' }] }), /unknown fields/);
  assert.throws(
    () => validateTimeline({ events: [{ unique_id: 'a', start_date: { year: 1 } }, { unique_id: 'a', start_date: { year: 2 } }] }),
    /repeats/,
  );
  assert.throws(() => validateTimeline({ events: [], eras: [{ start_date: { year: 1 } }] }), /Era 1/);
  assert.throws(() => validateTimeline({ events: [{ start_date: { year: 'soon' } }] }), /invalid date/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, name: ' ' } }), /Name the timeline/);
  assert.throws(() => validateProject({ ...good, project: { ...good.project, saved: 'never' } }), /save time/);
});
