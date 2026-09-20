import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { includedFetch, INCLUDED_MODEL } from './inference';
vi.mock('@/stores/authStore', () => ({
  useAuthStore: { getState: () => ({ account: { id: 'account-id' } }) },
}));
const auth = vi.hoisted(() => ({
  accessToken: 'account-jwt',
  refreshToken: null as string | null,
}));
vi.mock('./client', () => ({
  apiBaseUrl: () => 'https://api.example.test',
  getStoredTokens: () => auth,
  default: {
    get: vi.fn(async () => {
      auth.accessToken = 'refreshed-jwt';
      return { data: {} };
    }),
  },
}));
vi.mock('@/lib/usage-events', () => ({ notifyUsageChanged: vi.fn() }));
function sse() {
  const events = [
    {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-4-5-20251001',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Ready to create.' },
    },
    { type: 'content_block_stop', index: 0 },
    {
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage: { output_tokens: 5 },
    },
    { type: 'message_stop' },
  ];
  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
beforeEach(() => {
  auth.accessToken = 'account-jwt';
  auth.refreshToken = null;
});
afterEach(() => vi.unstubAllGlobals());
describe('included SDK transport', () => {
  it('streams through the real Anthropic SDK, uses JWT only and preserves provider counts', async () => {
    const fetch = vi.fn(async () => sse());
    vi.stubGlobal('fetch', fetch);
    const model = createAnthropic({
      apiKey: 'must-not-forward',
      baseURL: 'https://wrong.example/v1',
      fetch: includedFetch,
    })(INCLUDED_MODEL);
    const result = streamText({
      model,
      prompt: 'Make a page',
      maxOutputTokens: 1000,
      maxRetries: 0,
    });
    expect(await result.text).toBe('Ready to create.');
    expect((await result.usage).inputTokens).toBe(100);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/inference/v1/messages');
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer account-jwt',
      'X-Request-Id': expect.any(String),
    });
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe(INCLUDED_MODEL);
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(1000);
    expect(
      Object.keys(body).every((k) =>
        [
          'model',
          'messages',
          'system',
          'tools',
          'tool_choice',
          'stream',
          'max_tokens',
          'temperature',
          'top_p',
          'stop_sequences',
        ].includes(k),
      ),
    ).toBe(true);
  });
  it('keeps the same request ID for the sole safe retry after rejected authentication', async () => {
    auth.refreshToken = 'refresh';
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(sse());
    vi.stubGlobal('fetch', fetch);
    await includedFetch('https://ignored.example', { body: '{}' });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![1].headers['X-Request-Id']).toBe(
      fetch.mock.calls[1]![1].headers['X-Request-Id'],
    );
    expect(fetch.mock.calls[1]![1].headers.Authorization).toBe('Bearer refreshed-jwt');
  });
  it('preserves allowance errors and does not retry them', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'Allowance full. Check Usage.' }), { status: 429 }),
    );
    vi.stubGlobal('fetch', fetch);
    const response = await includedFetch('', { body: '{}' });
    expect(response.status).toBe(429);
    expect((await response.json()).error.message).toContain('Allowance full');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry an uncertain network failure', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('disconnected'));
    vi.stubGlobal('fetch', fetch);
    await expect(includedFetch('', { body: '{}' })).rejects.toThrow('disconnected');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
