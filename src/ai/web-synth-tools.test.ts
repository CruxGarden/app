import { describe, expect, it } from 'vitest';
import { WEB_SYNTH_TOOLS, webSynthCommand } from './web-synth-tools';

describe('web-synth App Tools', () => {
  it('declares inspection, tempo, add and rename with their written paths', () => {
    expect(WEB_SYNTH_TOOLS.map((t) => [t.name, t.writes])).toEqual([
      ['inspect_web_synth', []],
      ['set_web_synth_tempo', ['data/project.json']],
      ['add_web_synth_module', ['data/project.json']],
      ['rename_web_synth_module', ['data/project.json']],
    ]);
  });
  it('maps valid inputs to bridge commands and refuses the rest', () => {
    expect(webSynthCommand('inspect_web_synth', {})).toEqual({ op: 'inspect' });
    expect(webSynthCommand('set_web_synth_tempo', { bpm: 128 })).toEqual({ op: 'set-tempo', bpm: 128 });
    expect(webSynthCommand('add_web_synth_module', { kind: 'midi_editor', title: ' Lead ' })).toEqual({
      op: 'add-module',
      kind: 'midi_editor',
      title: 'Lead',
    });
    expect(webSynthCommand('add_web_synth_module', { kind: 'sequencer' })).toEqual({ op: 'add-module', kind: 'sequencer' });
    const id = '0a9d84e5-03d9-0194-01c4-3504c93eea1e';
    expect(webSynthCommand('rename_web_synth_module', { id, title: 'Melody' })).toEqual({ op: 'rename-module', id, title: 'Melody' });
    for (const [name, input] of [
      ['inspect_web_synth', { extra: 1 }],
      ['set_web_synth_tempo', { bpm: 10 }],
      ['set_web_synth_tempo', { bpm: '128' }],
      ['add_web_synth_module', { kind: 'Synth Designer' }],
      ['add_web_synth_module', { kind: 'sequencer', title: '' }],
      ['rename_web_synth_module', { id: 'nope', title: 'x' }],
      ['rename_web_synth_module', { id, title: 'x'.repeat(121) }],
      ['delete_everything', {}],
    ] as const)
      expect(() => webSynthCommand(name, input as Record<string, unknown>), name).toThrow();
  });
});
