import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, resolveTargets } from './commands.js';

const slides = [
  {
    id: 'first',
    elements: [
      { id: 'title', type: 'text', content: '<p>Launch</p>' },
      { id: 'locked', type: 'image', lock: true },
    ],
  },
  { id: 'second', elements: [{ id: 'line', type: 'line', left: 0, top: 0 }] },
];
test('resolves live native IDs and rejects stale, locked or incompatible targets without mutation', () => {
  const before = JSON.stringify(slides);
  assert.equal(
    resolveTargets(slides, { op: 'edit-element', slideId: 'first', elementId: 'title' }).element.id,
    'title',
  );
  for (const command of [
    { op: 'delete-slide', slideId: 'gone' },
    { op: 'edit-element', slideId: 'first', elementId: 'gone' },
    { op: 'edit-element', slideId: 'first', elementId: 'locked', left: 10 },
    { op: 'edit-element', slideId: 'second', elementId: 'line', height: 100 },
    { op: 'move-slide', slideId: 'first', index: 2 },
  ])
    assert.throws(() => resolveTargets(slides, command));
  assert.throws(() => resolveTargets(slides.slice(0, 1), { op: 'delete-slide', slideId: 'first' }));
  assert.equal(JSON.stringify(slides), before);
});
test('validates at the editor boundary as well as in the host', () => {
  for (const command of [
    null,
    [],
    { op: 'constructor' },
    { op: 'inspect', limit: Infinity },
    { op: 'set-title', title: 'Valid', extra: 'ignored?' },
    { op: 'edit-element', slideId: 'first', elementId: 'title', replace: 'without find' },
    { op: 'add-text', slideId: 'first', text: 'Hi', left: 0, top: 0, width: 0, height: 100 },
    { op: 'save-presentation', name: '' },
  ])
    assert.throws(() => validateCommand(command));
});
