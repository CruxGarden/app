import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TYPES, starter, validateProject, applyCommand, tableExample } from '../shared/model.js';
import { parseCSV, tableCSV, importedTable } from '../shared/csv.js';
test('each starter and business example is a valid portable document', () => {
  for (const type of TYPES) assert.equal(validateProject(starter(type), type).type, type);
  for (const name of ['projects', 'contacts', 'inventory'])
    validateProject(tableExample(name), 'tables');
});
test('commands preserve existing content and reject malformed changes without altering the original', () => {
  const table = starter('tables'),
    before = JSON.stringify(table);
  const updated = applyCommand(table, { op: 'rows', rows: [{ id: 'task-1', hours: 8 }] });
  assert.equal(updated.rows[0].hours, 8);
  assert.equal(updated.rows[0].task, table.rows[0].task);
  assert.equal(JSON.stringify(table), before);
  assert.throws(() =>
    applyCommand(table, { op: 'rows', rows: [{ id: 'task-1', hours: 'eight' }] }),
  );
  assert.equal(JSON.stringify(table), before);
  assert.throws(() => applyCommand(table, { op: 'rows', rows: [{ id: '__proto__', hours: 8 }] }));
  assert.throws(() => applyCommand(table, { op: 'pattern', bpm: 120 }));
  const scene = applyCommand(starter('playcanvas'), {
    op: 'objects',
    objects: [{ id: 'center', color: '#ff0000' }],
  });
  assert.equal(scene.objects[0].color, '#ff0000');
  assert.equal(scene.objects[0].name, 'Sunstone');
});
test('rejects invalid media references, unknown effects, oversized tables and invalid music/scene values', () => {
  for (const source of ['../private.png', 'https://example.com/a.png', 'assets/not-a-hash.png'])
    assert.throws(() => validateProject({ ...starter('openmosh'), source }));
  assert.throws(() =>
    applyCommand(starter('openmosh'), {
      op: 'effects',
      effects: [{ kind: 'arbitrary', values: {} }],
    }),
  );
  assert.throws(() => applyCommand(starter('smplr'), { op: 'pattern', bpm: Infinity }));
  assert.throws(() => applyCommand(starter('smplr'), { op: 'pattern', pattern: { kick: [true] } }));
  assert.throws(() =>
    applyCommand(starter('playcanvas'), {
      op: 'objects',
      objects: [{ id: 'center', scale: [0, 1, 1] }],
    }),
  );
  const table = starter('tables');
  table.rows = Array.from({ length: 2001 }, (_, i) => ({ id: 'row-' + i }));
  assert.throws(() => validateProject(table));
});
test('CSV preserves quoted newlines, commas and leading zeroes and exports spreadsheet formulas as text', () => {
  assert.deepEqual(parseCSV('Name,Note\r\n"A, B","line 1\nline ""2"""'), [
    ['Name', 'Note'],
    ['A, B', 'line 1\nline "2"'],
  ]);
  const doc = importedTable('Code,Note\n0012,=1+1');
  assert.equal(doc.rows[0]['column-1'], '0012');
  assert.match(tableCSV(doc), /"'=1\+1"/);
  assert.throws(() => parseCSV('"unclosed'));
  assert.throws(() => importedTable('A\n1,2'));
});
