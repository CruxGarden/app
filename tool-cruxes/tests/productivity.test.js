import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starter, validateProject, applyCommand } from '../shared/model.js';
import { sheetCSV } from '../shared/productivity.js';
test('whiteboard commands preserve unrelated native data and external image references', () => {
  const doc = starter('excalidraw');
  doc.scene.elements[0].groupIds = ['group-1'];
  const next = applyCommand(doc, {
    op: 'drawing',
    elements: [
      { id: 'idea', backgroundColor: '#a5d8ff' },
      { id: 'new', type: 'text', text: 'Hello', x: 400, y: 100 },
    ],
  });
  assert.equal(next.scene.elements.length, 3);
  assert.deepEqual(next.scene.elements[0].groupIds, ['group-1']);
  assert.equal(doc.scene.elements[0].backgroundColor, '#b2f2bb');
  assert.throws(() =>
    validateProject({
      ...doc,
      scene: { ...doc.scene, assets: { photo: 'https://example.com/image.png' } },
    }),
  );
  assert.throws(() =>
    validateProject({
      ...doc,
      scene: { ...doc.scene, elements: [{ ...doc.scene.elements[0], type: 'embeddable' }] },
    }),
  );
});
test('workbook commands preserve formatting, clear previous formula metadata and bound addresses', () => {
  const doc = starter('univer');
  const sheet = doc.workbook.sheets['budget-sheet'];
  sheet.cellData[1][1] = { v: 4, f: '=2+2', si: 'shared', p: {}, s: { bl: 1 } };
  const next = applyCommand(doc, {
    op: 'cells',
    sheetId: 'budget-sheet',
    cells: [
      { address: 'B2', value: 8 },
      { address: 'D6', value: '=SUM(D2:D3)' },
    ],
  });
  assert.deepEqual(next.workbook.sheets['budget-sheet'].cellData[1][1], { v: 8, s: { bl: 1 } });
  assert.equal(next.workbook.sheets['budget-sheet'].cellData[5][3].f, '=SUM(D2:D3)');
  for (const address of ['A0', 'ZZ9999', 'A10000', '../A1'])
    assert.throws(() =>
      applyCommand(doc, { op: 'cells', sheetId: 'budget-sheet', cells: [{ address, value: 3 }] }),
    );
  assert.throws(() =>
    applyCommand(doc, { op: 'cells', sheetId: '__proto__', cells: [{ address: 'A1', value: 3 }] }),
  );
  assert.throws(() =>
    validateProject({ ...doc, workbook: { ...doc.workbook, sheetOrder: ['missing'] } }),
  );
});
test('CSV exports evaluated values, quotes commas and protects formula-like text', () => {
  assert.equal(
    sheetCSV({
      cellData: { 0: { 0: { v: 'A,B' }, 1: { v: '=unsafe' }, 2: { v: 12, f: '=6*2' } } },
    }),
    '"A,B",\'=unsafe,12',
  );
});

test('drawing commands reject malformed text, colors and unknown properties before rendering', () => {
  const doc = starter('excalidraw');
  for (const element of [
    { id: 'label', text: 42 },
    { id: 'idea', backgroundColor: {} },
    { id: 'idea', backgroundColor: '#12345' },
    { id: 'new', type: 'rectangle', unknown: true },
  ])
    assert.throws(() => applyCommand(doc, { op: 'drawing', elements: [element] }));
  assert.equal(sheetCSV({ cellData: { 0: { 0: { v: -12 }, 1: { v: '-12' } } } }), "-12,'-12");
});
