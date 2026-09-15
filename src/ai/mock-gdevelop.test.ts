import { expect, it } from 'vitest';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { getMockLanguageModel } from './mock-model';
it('the deliberate stale-object scenario uses retained identity fields from shortened history', async () => {
  const original = JSON.stringify({
    behavior: 'Move',
    items: 'x'.repeat(2000),
    expectedState: 'a'.repeat(64),
  });
  const shortened = original.slice(0, 900) + '\n\n…(omitted)…\n\n' + original.slice(-450);
  const model = getMockLanguageModel() as LanguageModelV4;
  const { stream } = await model.doStream({
    prompt: [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'earlier',
            toolName: 'inspect_gdevelop_object',
            output: { type: 'text', value: shortened },
          },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: '[gdevelop:object-stale]' }] },
    ],
  });
  const reader = stream.getReader();
  let call;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.type === 'tool-call') call = next.value;
  }
  expect(call?.toolName).toBe('edit_gdevelop_properties');
  expect(JSON.parse(call!.input)).toMatchObject({
    expectedState: 'a'.repeat(64),
    behavior: 'Move',
  });
});
it('the event playback scenario updates the start condition with a valid command', async () => {
  const { gdevelopEventCommand } = await import('./gdevelop-event-tools');
  const model = getMockLanguageModel() as LanguageModelV4;
  const { stream } = await model.doStream({
    prompt: [
      { role: 'user', content: [{ type: 'text', text: '[gdevelop:event-start]' }] },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'inspect',
            toolName: 'inspect_gdevelop_events',
            output: { type: 'text', value: JSON.stringify({ expectedState: 'b'.repeat(64) }) },
          },
        ],
      },
    ],
  });
  const reader = stream.getReader();
  let call;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.type === 'tool-call') call = next.value;
  }
  expect(call?.toolName).toBe('edit_gdevelop_instruction');
  const input = JSON.parse(call!.input);
  expect(() => gdevelopEventCommand(call!.toolName, input)).not.toThrow();
  expect(input.action).toBe('update');
  expect(input.instruction.inverted).toBe(false);
});
