import { expect, it } from 'vitest';
import { WICK_TOOLS, wickCommand } from './wick-editor-tools';
it('maps Wick operations and refuses bad input', () => {
  expect(WICK_TOOLS.map((t) => t.name)).toEqual(['inspect_wick', 'set_wick_name', 'set_wick_framerate']);
  expect(wickCommand('inspect_wick', {})).toEqual({ op: 'inspect' });
  expect(wickCommand('set_wick_name', { name: ' Garden anim ' })).toEqual({ op: 'set-name', name: 'Garden anim' });
  expect(wickCommand('set_wick_framerate', { framerate: 24 })).toEqual({ op: 'set-framerate', framerate: 24 });
  for (const [name, input] of [
    ['inspect_wick', { x: 1 }],
    ['set_wick_name', { name: '' }],
    ['set_wick_framerate', { framerate: 0 }],
    ['set_wick_framerate', { framerate: 12.5 }],
    ['play_wick', {}],
  ] as const)
    expect(() => wickCommand(name, input as Record<string, unknown>), name).toThrow();
});
