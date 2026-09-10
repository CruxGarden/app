import { expect, it } from 'vitest';
import {
  appToolDefinitions,
  executeAppTool,
  registerAppTools,
  isMutatingAppTool,
  type AppToolDefinition,
} from './embedded-app-tool-registry';

it('discovers and routes independent app adapters without sharing owners or stale handlers', async () => {
  const tool = (name: string, writes: string[]): AppToolDefinition => ({
    name,
    writes,
    description: 'Test adapter operation',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  });
  const note = tool('test_create_note', ['notebook/Example.md']);
  const frame = tool('test_inspect_frame', []);
  const offA = registerAppTools('notes-a', { tools: [note], execute: async () => 'notes-a' });
  const offB = registerAppTools('design-b', { tools: [frame], execute: async () => 'design-b' });
  try {
    expect(appToolDefinitions('notes-a').map((t) => t.name)).toEqual(['test_create_note']);
    expect(appToolDefinitions('design-b').map((t) => t.name)).toEqual(['test_inspect_frame']);
    expect(await executeAppTool('notes-a', note.name, {})).toBe('notes-a');
    await expect(executeAppTool('design-b', note.name, {})).rejects.toThrow('Open the app');
    expect(isMutatingAppTool(note.name)).toBe(true);
    expect(isMutatingAppTool(frame.name)).toBe(false);
    // Teardown of an old frame must not remove the replacement controller.
    const offReplacement = registerAppTools('notes-a', {
      tools: [note],
      execute: async () => 'replacement',
    });
    offA();
    expect(await executeAppTool('notes-a', note.name, {})).toBe('replacement');
    offReplacement();
    expect(appToolDefinitions('notes-a')).toEqual([]);
    await expect(executeAppTool('notes-a', note.name, {})).rejects.toThrow();
  } finally {
    offA();
    offB();
  }
});
