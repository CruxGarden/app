import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateProject } from './document.js';
const event = (over = {}) => ({ id: 'a1b2c3d4', title: 'Launch review', start: '2026-09-15T10:00:00', end: '2026-09-15T11:00:00', allDay: false, color: '#2f6f4e', notes: '', ...over });
const doc = (events, over = {}) => ({ version: 1, app: 'eventcalendar', project: { name: 'Calendar', view: 'dayGridMonth', date: '2026-09-01', events, saved: 't', ...over } });
test('accepts an empty project and a calendar', () => {
  validateProject({ version: 1, app: 'eventcalendar', project: null });
  validateProject(doc([]));
  validateProject(doc([event(), event({ id: 'x', end: '', allDay: true, color: '' })], { date: '' }));
});
test('rejects other apps, bad times and bad events', () => {
  assert.throws(() => validateProject({ version: 1, app: 'kan', project: null }));
  assert.throws(() => validateProject(doc([event({ start: '2026-09-15 10:00' })])), /start/);
  assert.throws(() => validateProject(doc([event({ end: '2026-09-15T10:00:00Z' })])), /end/);
  assert.throws(() => validateProject(doc([event({ title: ' ' })])), /title/);
  assert.throws(() => validateProject(doc([event({ color: 'green' })])), /colour/);
  assert.throws(() => validateProject(doc([event({ extra: 1 })])), /Invalid event\./);
  assert.throws(() => validateProject(doc([], { date: '2026/09/01' })), /date/);
});
