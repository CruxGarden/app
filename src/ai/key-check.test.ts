import { describe, expect, it, vi } from 'vitest';
import { checkApiKey, keyCheckMessage } from './key-check';

// Every provider answer here is a stub: no test in this file reaches a network.
const answer = (status: number, body = '{}') =>
  vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body, { status }));

const KEY = 'sk-secret-key-value';

describe('checkApiKey', () => {
  it.each([
    ['anthropic', 'https://api.anthropic.com/v1/models?limit=1', 'x-api-key', KEY],
    ['openai', 'https://api.openai.com/v1/models', 'Authorization', `Bearer ${KEY}`],
    [
      'google',
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',
      'x-goog-api-key',
      KEY,
    ],
  ])('lists models at %s with the key in a header only', async (provider, url, header, value) => {
    const fetch = answer(200);
    expect(await checkApiKey(provider, KEY, { fetch })).toBe('valid');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetch.mock.calls[0]!;
    expect(calledUrl).toBe(url);
    expect(String(calledUrl)).not.toContain(KEY);
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>)[header]).toBe(value);
    expect(init?.body).toBeUndefined();
  });

  it('reports a key the provider refuses', async () => {
    expect(await checkApiKey('anthropic', KEY, { fetch: answer(401) })).toBe('refused');
    expect(await checkApiKey('openai', KEY, { fetch: answer(401) })).toBe('refused');
    const google = answer(400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}');
    expect(await checkApiKey('google', KEY, { fetch: google })).toBe('refused');
  });

  it.each([
    ['a key without permission to list models', 403],
    ['rate limiting', 429],
    ['a provider outage', 503],
    ['an unrelated bad request', 400],
  ])('does not call %s a refusal', async (_name, status) => {
    expect(await checkApiKey('openai', KEY, { fetch: answer(status) })).toBe('unchecked');
  });

  it('cannot check offline, and says so rather than failing', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await checkApiKey('anthropic', KEY, { fetch: offline })).toBe('unchecked');
  });

  it('gives up on a provider that never answers', async () => {
    const hang = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)),
        ),
    );
    expect(await checkApiKey('anthropic', KEY, { fetch: hang, timeoutMs: 5 })).toBe('unchecked');
  });

  it('asks nothing of providers that have no key to check', async () => {
    const fetch = answer(200);
    for (const provider of ['ollama', 'lmstudio', 'claude-code', 'codex', 'included', 'nobody'])
      expect(await checkApiKey(provider, KEY, { fetch })).toBe('unchecked');
    expect(await checkApiKey('anthropic', '', { fetch })).toBe('unchecked');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never logs the key', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    await checkApiKey('anthropic', KEY, { fetch: answer(401) });
    await checkApiKey('anthropic', KEY, {
      fetch: vi.fn(async () => {
        throw new Error(`boom ${KEY}`);
      }),
    });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('keyCheckMessage', () => {
  it('says what happened and that the key is saved in every state', () => {
    expect(keyCheckMessage('checking', 'OpenAI')).toBe('Saved. Checking this key…');
    expect(keyCheckMessage('valid', 'OpenAI')).toBe('Saved. OpenAI accepted this key.');
    expect(keyCheckMessage('refused', 'OpenAI')).toMatch(
      /This key was refused by OpenAI\. It is saved/,
    );
    expect(keyCheckMessage('unchecked', 'OpenAI')).toMatch(
      /Could not check this key.*Saved anyway/,
    );
  });
});
