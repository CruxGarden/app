import { describe, expect, it } from 'vitest';
import { workbookCommand } from './workbook-tools';
import { samplerTools } from './sampler-tools';
describe('workbook commands at the host boundary', () => {
  it('registers the deeper tools and validates cell writes before dispatch', () => {
    const adapter = samplerTools('univer')!;
    expect(adapter.tools.map((t) => t.name)).toContain('save_workbook_csv');
    expect(
      adapter.prepare('set_workbook_cells', {
        sheetId: 'budget-sheet',
        cells: [{ address: 'D6', value: '=SUM(D2:D3)' }],
      }),
    ).toMatchObject({ op: 'cells' });
    for (const value of [Infinity, {}, 'x'.repeat(2001)])
      expect(() =>
        adapter.prepare('set_workbook_cells', {
          sheetId: 'budget-sheet',
          cells: [{ address: 'A1', value }],
        }),
      ).toThrow();
    expect(() =>
      adapter.prepare('set_workbook_cells', {
        sheetId: 'budget-sheet',
        cells: [{ address: 'IW1', value: 3 }],
      }),
    ).toThrow();
  });
  it('refuses oversized/reversed ranges, invalid styles, unsafe IDs and unknown fields', () => {
    for (const range of ['A1:K10', 'B2:A1', 'IW1', 'A0', 'A1:B9999'])
      expect(() =>
        workbookCommand('read_workbook_range', { sheetId: 'budget-sheet', range }),
      ).toThrow();
    for (const input of [
      { sheetId: '__proto__', range: 'A1', bold: true },
      { sheetId: 'budget-sheet', range: 'A1', color: '#ffffff' },
      { sheetId: 'budget-sheet', range: 'A1', numberFormat: 'invalid' },
    ])
      expect(() => workbookCommand('format_workbook_range', input)).toThrow();
    expect(
      workbookCommand('format_workbook_range', {
        sheetId: 'budget-sheet',
        range: 'A1:D1',
        bold: false,
      }),
    ).toMatchObject({ bold: false });
    expect(() => workbookCommand('add_workbook_sheet', { name: 'Bad/name' })).toThrow();
    expect(() => workbookCommand('add_workbook_sheet', { name: 'Budget', rows: 10001 })).toThrow();
  });
});
