import { afterEach, describe, expect, it, vi } from 'vitest';
import { languageModelFor, runConversation, type ConversationEvent } from './engine';
import { generateImageBlob } from './tools';
import type { NormalizedMessage } from '@/services/types';

vi.mock('@/lib/platform', () => ({ isAiMock: () => false }));
vi.mock('./keys', () => ({
  getApiKey: async (provider: string) => (provider === 'openai' ? 'fixture-key' : null),
}));
afterEach(() => vi.unstubAllGlobals());

function claudeResponse(model: string, round: number): Response {
  const tool = round < 2;
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: {
        id: `msg_${round}`,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'signature_delta', signature: `signed-${round}` },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'content_block_start',
      index: 1,
      content_block: tool
        ? { type: 'tool_use', id: `call_${round}`, name: 'write_file', input: {} }
        : { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: tool
        ? {
            type: 'input_json_delta',
            partial_json: JSON.stringify({ path: `page-${round}.html`, content: '<h1>Hello</h1>' }),
          }
        : { type: 'text_delta', text: 'Created both pages.' },
    },
    { type: 'content_block_stop', index: 1 },
    {
      type: 'message_delta',
      delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ];
  return new Response(
    events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('current provider wire compatibility', () => {
  it.each(['claude-opus-5-5', 'claude-sonnet-5-5'])(
    'preserves empty signed thinking and append-only history across mutations with %s',
    async (model) => {
      const bodies: {
        messages: { role: string; content: unknown }[];
        model: string;
        max_tokens: number;
        tools: unknown[];
      }[] = [];
      const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
        expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        expect(body.model).toBe(model);
        expect(body.temperature).toBeUndefined();
        expect(body.thinking?.type).not.toBe('disabled');
        expect(body.tool_choice.type).toBe('auto');
        return claudeResponse(model, bodies.length - 1);
      });
      vi.stubGlobal('fetch', fetch);
      let revision = 0;
      const events: ConversationEvent[] = [];
      for await (const e of runConversation(
        'fixture-key',
        'fixture-crux',
        [{ role: 'user', content: 'Create two pages' } as NormalizedMessage],
        model,
        async () => {
          revision++;
          return 'Created file: page.html';
        },
        undefined,
        {
          systemPrompt: 'Create the requested files.',
          contextBlock: async () => `<workspace_context>Revision ${revision}</workspace_context>`,
          tools: [
            {
              name: 'write_file',
              description: 'Write a file',
              input_schema: {
                type: 'object',
                properties: { path: { type: 'string' }, content: { type: 'string' } },
                required: ['path', 'content'],
              },
            },
          ],
        },
      ))
        events.push(e);
      expect(events.filter((e) => e.type === 'error')).toEqual([]);
      expect(events.at(-1)).toMatchObject({
        type: 'done',
        hadMutation: true,
        textContent: 'Created both pages.',
      });
      expect(bodies).toHaveLength(3);
      for (let i = 1; i < bodies.length; i++) {
        const previous = bodies[i - 1]!.messages;
        expect(bodies[i]!.messages.slice(0, previous.length)).toEqual(previous);
        expect(JSON.stringify(bodies[i]!.messages.at(-1))).toContain(`Revision ${i}`);
        expect(bodies[i]!.messages.filter((m) => m.role === 'assistant').at(-1)!.content).toEqual(
          expect.arrayContaining([
            { type: 'thinking', thinking: '', signature: `signed-${i - 1}` },
          ]),
        );
      }
    },
  );

  it.each(['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra'])(
    'uses Responses and supported parameters for %s tool requests',
    async (model) => {
      let body: Record<string, unknown> | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: unknown, init?: RequestInit) => {
          expect(String(url)).toBe('https://api.openai.com/v1/responses');
          body = JSON.parse(String(init?.body));
          return new Response(
            JSON.stringify({
              id: 'resp_fixture',
              created_at: 1,
              model,
              status: 'completed',
              output: [
                {
                  type: 'function_call',
                  id: 'fc_1',
                  call_id: 'call_1',
                  name: 'list_files',
                  arguments: '{}',
                },
              ],
              usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          );
        }),
      );
      const client = languageModelFor(model, 'fixture-key');
      if (typeof client === 'string') throw new Error('Expected a provider model');
      const result = await client.doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'List files' }] }],
        maxOutputTokens: 2048,
        tools: [
          { type: 'function', name: 'list_files', inputSchema: { type: 'object', properties: {} } },
        ],
      });
      expect(body).toMatchObject({
        model,
        max_output_tokens: 2048,
        tools: [expect.objectContaining({ type: 'function', name: 'list_files' })],
      });
      expect(body?.temperature).toBeUndefined();
      expect(result.content).toContainEqual(
        expect.objectContaining({
          type: 'tool-call',
          toolName: 'list_files',
          toolCallId: 'call_1',
        }),
      );
    },
  );
});

it('generates a PNG with the current image model through the real OpenAI SDK', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.openai.com/v1/images/generations');
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'gpt-image-2.5-flare',
        prompt: 'A garden',
        n: 1,
        size: '1536x1024',
        output_format: 'png',
      });
      return new Response(JSON.stringify({ created: 1, data: [{ b64_json: 'iVBORw0KGgo=' }] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  const result = await generateImageBlob('A garden', '1536x1024', 'gpt-6.1-sol');
  expect(result).toMatchObject({ provider: 'openai' });
  if (!('blob' in result)) throw new Error(result.error);
  expect(result.blob.type).toBe('image/png');
  expect(new Uint8Array(await result.blob.arrayBuffer())).toEqual(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  );
});
