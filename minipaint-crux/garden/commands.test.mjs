import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, reviseText, textData } from './commands.js';

test('exact text revision crosses styled runs without changing the original or unrelated formatting', () => {
  const data = [
    [
      { text: 'We meet Fri', meta: { bold: true, size: 32 } },
      { text: 'day at noon.', meta: { italic: true } },
    ],
    [{ text: 'Bring envelopes.', meta: { family: 'Georgia' } }],
  ];
  const original = JSON.stringify(data);
  const revised = reviseText(data, { find: 'Friday', replace: 'Saturday' });
  assert.equal(revised[0].map((span) => span.text).join(''), 'We meet Saturday at noon.');
  assert.deepEqual(revised[1], data[1]);
  assert.deepEqual(
    revised[0].map((span) => span.meta),
    data[0].map((span) => span.meta),
  );
  assert.equal(JSON.stringify(data), original);
  assert.throws(() => reviseText(data, { find: 'missing', replace: 'x' }));
  assert.throws(() =>
    reviseText(textData('Friday Friday'), { find: 'Friday', replace: 'Saturday' }),
  );
});
test('validates commands at the native boundary', () => {
  assert.equal(validateCommand({ op: 'resize-canvas', width: 1200, height: 600 }).width, 1200);
  assert.equal(validateCommand({ op: 'layer', id: 1, find: 'Friday', replace: '' }).replace, '');
  for (const command of [
    null,
    [],
    { op: 'constructor' },
    { op: 'inspect', extra: true },
    { op: 'inspect', limit: 51 },
    { op: 'layer', id: 1 },
    { op: 'layer', id: 1, opacity: NaN },
    { op: 'resize-canvas', width: 8192, height: 8192 },
    { op: 'resize-canvas', width: 500.5, height: 400 },
    { op: 'layer', id: 1, find: 'line\nbreak', replace: 'x' },
    { op: 'add-image', path: '../outside.png', x: 0, y: 0, width: 100, height: 100 },
    { op: 'add-text', text: 'Hi', x: 0, y: 0, width: 100, height: 100, fontFamily: 'Hosted Font' },
    { op: 'add-rectangle', x: 0, y: 0, width: 100, height: 100, color: 'url(remote)' },
  ])
    assert.throws(() => validateCommand(command));
});
