import { describe, it, expect } from 'vitest';
import { PISKEL_TOOLS, piskelCommand } from './piskel-tools';
describe('sprite tools', () => {
  it('declares pixel asset writes and keeps inspection read-only', () => {
    expect(PISKEL_TOOLS.find((t) => t.name === 'inspect_piskel')?.writes).toEqual([]);
    for (const tool of PISKEL_TOOLS.filter((t) => t.name !== 'inspect_piskel'))
      expect(tool.writes).toContain('data/assets/');
    expect(PISKEL_TOOLS.find((t) => t.name === 'save_piskel_sheet')?.writes).toContain('exports/');
  });
  it('maps valid operations and refuses operation overrides and malformed pixels', () => {
    expect(piskelCommand('save_piskel_sheet', { name: 'Animation' })).toEqual({
      op: 'save-sheet',
      label: 'Animation',
    });
    expect(piskelCommand('duplicate_piskel_frame', { frameId: '123' })).toEqual({
      op: 'duplicate-frame',
      frameId: '123',
    });
    expect(() => piskelCommand('inspect_piskel', { op: 'paint' })).toThrow();
    expect(() => piskelCommand('paint_piskel_pixels', { pixels: [] })).toThrow();
    expect(() => piskelCommand('set_piskel_speed', { fps: 25 })).toThrow();
  });
});
