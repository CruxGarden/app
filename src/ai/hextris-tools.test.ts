import { expect, it } from 'vitest';
import { HEXTRIS_TOOLS, hextrisCommand } from './hextris-tools';
it('maps the two Hextris operations and refuses input or unknown names', () => {
  expect(HEXTRIS_TOOLS.map((t) => t.name)).toEqual(['inspect_hextris', 'reset_hextris_progress']);
  expect(hextrisCommand('inspect_hextris', {})).toEqual({ op: 'inspect' });
  expect(hextrisCommand('reset_hextris_progress', {})).toEqual({ op: 'reset' });
  expect(() => hextrisCommand('inspect_hextris', { x: 1 })).toThrow();
  expect(() => hextrisCommand('play_hextris', {})).toThrow();
});
