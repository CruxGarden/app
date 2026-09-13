import { expect, it } from 'vitest';
import { AM1_TOOLS, am1Command } from './am-1-tools';
it('maps AM-1 operations and refuses bad input', () => {
  expect(AM1_TOOLS.map((t) => t.name)).toEqual(['inspect_am1', 'set_am1_tempo', 'set_am1_key']);
  expect(am1Command('inspect_am1', {})).toEqual({ op: 'inspect' });
  expect(am1Command('set_am1_tempo', { tempo: 96 })).toEqual({ op: 'set-tempo', tempo: 96 });
  expect(am1Command('set_am1_key', { key: 'D', scale: 'dorian' })).toEqual({
    op: 'set-key',
    key: 'D',
    scale: 'dorian',
  });
  expect(am1Command('set_am1_key', { key: 'A#' })).toEqual({ op: 'set-key', key: 'A#' });
  for (const [name, input] of [
    ['inspect_am1', { x: 1 }],
    ['set_am1_tempo', { tempo: 4 }],
    ['set_am1_tempo', { tempo: 96.5 }],
    ['set_am1_key', { key: 'H' }],
    ['set_am1_key', { key: 'D', scale: '' }],
    ['run_am1', {}],
  ] as const)
    expect(() => am1Command(name, input as Record<string, unknown>), name).toThrow();
});
