import { expect, it } from 'vitest';
import { RAWGRAPHS_TOOLS, rawgraphsCommand } from './rawgraphs-tools';
it('keeps discovery read-only and declares native data and output writes', () => {
  for (const name of ['inspect_rawgraphs', 'list_rawgraphs_charts'])
    expect(RAWGRAPHS_TOOLS.find((t) => t.name === name)?.writes).toEqual([]);
  expect(RAWGRAPHS_TOOLS.find((t) => t.name === 'update_rawgraphs_cells')?.writes).toContain(
    'data/assets/',
  );
  expect(RAWGRAPHS_TOOLS.find((t) => t.name === 'save_rawgraphs_figure')?.writes).toContain(
    'exports/',
  );
});
it('validates the host/frame contract, scoped data preconditions and native output formats', () => {
  expect(
    rawgraphsCommand('save_rawgraphs_figure', { name: ' Report ', format: 'rawgraphs' }),
  ).toEqual({ op: 'save-figure', label: 'Report', format: 'rawgraphs' });
  expect(() => rawgraphsCommand('inspect_rawgraphs', { op: 'load-data' })).toThrow();
  expect(() =>
    rawgraphsCommand('update_rawgraphs_cells', { cells: [{ row: 0, column: 'A', value: 5 }] }),
  ).toThrow(/dataHash/);
  expect(() =>
    rawgraphsCommand('map_rawgraphs_columns', { dimensions: { size: ['A', 'A'] } }),
  ).toThrow();
  expect(() =>
    rawgraphsCommand('set_rawgraphs_options', { values: JSON.parse('{"__proto__":true}') }),
  ).toThrow();
});
