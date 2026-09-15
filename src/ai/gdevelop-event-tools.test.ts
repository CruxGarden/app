import { describe, it, expect } from 'vitest';
import { GDEVELOP_EVENT_TOOLS, gdevelopEventCommand } from './gdevelop-event-tools';
describe('GDevelop native event tools', () => {
  it('declares inspection read-only and validates event writes before dispatch', () => {
    expect(GDEVELOP_EVENT_TOOLS).toHaveLength(4);
    expect(GDEVELOP_EVENT_TOOLS[0]!.writes).toEqual([]);
    expect(gdevelopEventCommand('inspect_gdevelop_events', { scene: 'Play' })).toEqual({
      op: 'inspect-events',
      scene: 'Play',
    });
    expect(gdevelopEventCommand('unrelated', {})).toBeNull();
    expect(() =>
      gdevelopEventCommand('edit_gdevelop_event', {
        scene: 'Play',
        action: 'remove',
        eventPath: [0],
      }),
    ).toThrow(/Inspect/);
    expect(() =>
      gdevelopEventCommand('inspect_gdevelop_events', { scene: 'Play', op: 'edit-event' }),
    ).toThrow();
    expect(() =>
      gdevelopEventCommand('edit_gdevelop_event', {
        scene: 'Play',
        expectedState: 'a'.repeat(64),
        action: 'remove',
        eventPath: [0],
        text: 'unused',
      }),
    ).toThrow();
  });
  it('permits bounded nested targeting and rejects instruction injection/unbounded values', () => {
    const c = {
      scene: 'Play',
      expectedState: 'a'.repeat(64),
      action: 'update',
      eventPath: [2, 0],
      list: 'conditions',
      instructionPath: [0, 1],
      instruction: { type: 'DepartScene', parameters: [''], inverted: true },
    };
    expect(gdevelopEventCommand('edit_gdevelop_instruction', c)?.op).toBe('edit-instruction');
    expect(() =>
      gdevelopEventCommand('edit_gdevelop_instruction', {
        ...c,
        instruction: { ...c.instruction, awaited: true },
      }),
    ).toThrow();
    expect(() =>
      gdevelopEventCommand('edit_gdevelop_instruction', { ...c, eventPath: Array(17).fill(0) }),
    ).toThrow();
  });
});
it('keeps native event indexes out of the host file-path argument', () => {
  for (const tool of GDEVELOP_EVENT_TOOLS)
    expect(tool.input_schema.properties).not.toHaveProperty('path');
  expect(
    gdevelopEventCommand('inspect_gdevelop_events', { scene: 'Play', eventPath: [1, 2] }),
  ).toEqual({ op: 'inspect-events', scene: 'Play', path: [1, 2] });
  expect(() =>
    gdevelopEventCommand('inspect_gdevelop_events', { scene: 'Play', path: [1, 2] }),
  ).toThrow();
});
