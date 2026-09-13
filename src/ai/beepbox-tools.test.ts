import { describe, expect, it } from 'vitest';
import { BEEPBOX_TOOLS, beepboxCommand } from './beepbox-tools';
describe('BeepBox App Tools', () => {
  it('declares inspect, tempo and key with their written paths', () => {
    expect(BEEPBOX_TOOLS.map((t) => [t.name, t.writes])).toEqual([
      ['inspect_beepbox', []],
      ['set_beepbox_tempo', ['data/project.json']],
      ['set_beepbox_key', ['data/project.json']],
    ]);
  });
  it('maps valid inputs and refuses the rest', () => {
    expect(beepboxCommand('inspect_beepbox', {})).toEqual({ op: 'inspect' });
    expect(beepboxCommand('set_beepbox_tempo', { tempo: 140 })).toEqual({ op: 'set-tempo', tempo: 140 });
    expect(beepboxCommand('set_beepbox_key', { key: 'D' })).toEqual({ op: 'set-key', key: 'D' });
    for (const [name, input] of [
      ['inspect_beepbox', { x: 1 }],
      ['set_beepbox_tempo', { tempo: 140.5 }],
      ['set_beepbox_tempo', { tempo: 10 }],
      ['set_beepbox_key', { key: 'H' }],
      ['set_beepbox_key', { key: 'D', extra: 1 }],
      ['play_beepbox', {}],
    ] as const)
      expect(() => beepboxCommand(name, input as Record<string, unknown>), name).toThrow();
  });
});
