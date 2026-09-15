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
