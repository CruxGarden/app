import { describe, it, expect } from 'vitest';
import { JUPYTERLITE_TOOLS, jupyterliteCommand } from './jupyterlite-tools';

describe('notebook tools', () => {
  it('keeps inspection read-only and declares executed notebook and file writes', () => {
    expect(JUPYTERLITE_TOOLS.find((t) => t.name === 'inspect_jupyterlite')?.writes).toEqual([]);
    expect(JUPYTERLITE_TOOLS.find((t) => t.name === 'run_jupyterlite_cell')?.writes).toContain(
      'data/assets/',
    );
    expect(JUPYTERLITE_TOOLS.find((t) => t.name === 'save_jupyterlite_plot')?.writes).toContain(
      'exports/',
    );
  });
  it('validates commands and cannot override the selected operation', () => {
    expect(
      jupyterliteCommand('append_jupyterlite_cell', {
        cellType: 'markdown',
        source: 'Manual note',
      }),
    ).toEqual({ op: 'append-cell', cellType: 'markdown', source: 'Manual note' });
    expect(
      jupyterliteCommand('save_jupyterlite_plot', { cellId: 'a', outputIndex: 0, name: 'Figure' }),
    ).toEqual({ op: 'save-plot', cellId: 'a', outputIndex: 0, label: 'Figure' });
    expect(() => jupyterliteCommand('inspect_jupyterlite', { op: 'delete-cell' })).toThrow();
    expect(() => jupyterliteCommand('save_jupyterlite_notebook', { label: 'bypass' })).toThrow();
    expect(() => jupyterliteCommand('run_jupyterlite_cell', {})).toThrow();
  });
});
