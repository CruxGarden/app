import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCommand, replaceSource, summarizeCell } from './commands.js';

test('rejects malformed and unbounded commands on either side of the bridge', () => {
  for (const value of [
    { op: 'run-cell' },
    { op: 'inspect', limit: 11 },
    { op: 'inspect', sourceOffset: 100 },
    { op: 'insert-cell', index: -1, cellType: 'code', source: '' },
    { op: 'create-notebook', name: '../lost.ipynb' },
    { op: 'replace-cell', cellId: 'id', find: '', replace: '' },
    { op: 'delete-cell', cellId: 'id', force: true },
    { op: 'save-plot', cellId: 'id', label: ' ', outputIndex: 0 },
  ])
    assert.throws(() => validateCommand(value));
  assert.equal(
    validateCommand({ op: 'inspect', cellId: 'id', sourceOffset: 6000 }).sourceOffset,
    6000,
  );
});
test('exact changes preserve manual text and reject stale or ambiguous passages', () => {
  assert.equal(replaceSource('Mean 4.0. My note.', '4.0', '5.0'), 'Mean 5.0. My note.');
  assert.throws(() => replaceSource('a a', 'a', 'b'), /exactly once/);
  assert.throws(() => replaceSource('my edit', 'old text', 'new'), /exactly once/);
});
test('inspection pages long source and bounds outputs without leaking image/HTML bodies', () => {
  const cell = {
    getId: () => 'stable',
    cell_type: 'code',
    getSource: () => 'x'.repeat(10000),
    getOutputs: () => [
      {
        output_type: 'display_data',
        data: {
          'image/png': 'SECRET_BINARY',
          'text/html': '<script>SECRET_HTML</script>',
          'text/plain': ['chart'],
        },
      },
      { output_type: 'error', ename: 'KeyError', evalue: 'Height', traceback: ['long traceback'] },
    ],
  };
  const summary = summarizeCell(cell, 2, 6000, 2000);
  assert.equal(summary.nextSourceOffset, 8000);
  assert.equal(summary.source.length, 2000);
  assert.equal(summary.outputs[0].exportablePng, true);
  assert.equal(summary.outputs[1].message, 'Height');
  assert.ok(!JSON.stringify(summary).includes('SECRET'));
});
