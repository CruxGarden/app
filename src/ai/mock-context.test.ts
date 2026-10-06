import { expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4Prompt } from '@ai-sdk/provider';
import { getMockLanguageModel } from './mock-model';

it('finishes the seed script after workspace updates without restarting its tool sequence', async () => {
  const prompt: LanguageModelV4Prompt = [
    { role: 'user', content: [{ type: 'text', text: '[zen:seed]' }] },
    ...['report_progress', 'write_file'].flatMap(
      (toolName): LanguageModelV4Prompt => [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: toolName,
              toolName,
              output: { type: 'text', value: 'Created file: garden/seed.json' },
            },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: '<workspace_context>Updated files</workspace_context>' }],
        },
      ],
    ),
  ];
  const model = getMockLanguageModel() as LanguageModelV4;
  const { stream } = await model.doStream({ prompt });
  const reader = stream.getReader();
  let text = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    expect(next.value.type).not.toBe('tool-call');
    if (next.value.type === 'text-delta') text += next.value.delta;
  }
  expect(text).toContain('Seed turn returned:');
});
