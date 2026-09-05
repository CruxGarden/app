import { describe, it, expect, afterEach } from 'vitest';
import type { LanguageModel } from 'ai';
import {
  PROVIDERS,
  UNKNOWN_KEY_MESSAGE,
  detectProvider,
  injectedModel,
  isAuthError,
  modelFor,
  modelIdFor,
  providerInfo,
  refusedMessage,
  temperatureFor,
  validateConfig,
} from './src/lib/model';

/**
 * The browser model seam: a visitor's (provider, key) becomes a LanguageModel;
 * a scripted model on `window.__fiveWsModel` wins (e2e); the `crux` managed
 * provider is a named seam that does not open yet (ADR 0015).
 */
describe('modelFor', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('builds a model per provider with the default model id when none is given', () => {
    for (const p of PROVIDERS) {
      const m = modelFor({ provider: p.id, apiKey: 'k' }) as { provider: string; modelId: string };
      expect(m.modelId).toBe(p.defaultModel);
      expect(m.provider).toContain(p.id === 'google' ? 'google' : p.id);
    }
  });

  it('honours an explicit model id', () => {
    const m = modelFor({ provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5' }) as {
      modelId: string;
    };
    expect(m.modelId).toBe('claude-opus-5');
    expect(modelIdFor({ provider: 'openai', apiKey: 'k', model: '  ' })).toBe(
      providerInfo('openai')!.defaultModel,
    );
  });

  it('refuses what it cannot use, in a sentence the form can show', () => {
    expect(validateConfig({ provider: 'anthropic' })).toBe('Paste a key.');
    expect(validateConfig({ provider: 'crux' })).toMatch(/not available yet/);
    expect(() => modelFor({ provider: 'openai' })).toThrow('Paste a key.');
    expect(() => modelFor({ provider: 'crux' })).toThrow(/Managed inference/);
    expect(validateConfig({ provider: 'google', apiKey: 'k' })).toBeNull();
  });

  it('sends no temperature to OpenAI (reasoning models reject it); the engine defaults elsewhere', () => {
    expect(temperatureFor({ provider: 'openai', apiKey: 'k' })).toBe('default');
    expect(temperatureFor({ provider: 'anthropic', apiKey: 'k' })).toBeUndefined();
    expect(temperatureFor({ provider: 'google', apiKey: 'k' })).toBeUndefined();
  });

  it('prefers a scripted model injected on window, even with no key at all', () => {
    const scripted = { specificationVersion: 'v4', provider: 'mock', modelId: 'mock' };
    (globalThis as { window?: unknown }).window = { __fiveWsModel: scripted };
    expect(injectedModel()).toBe(scripted as unknown as LanguageModel);
    expect(modelFor({ provider: 'crux' })).toBe(scripted as unknown as LanguageModel);
  });

  it('lists the three connectable providers, the free one first, with a keys page each', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['google', 'openai', 'anthropic']);
    expect(PROVIDERS.map((p) => p.keysUrl)).toEqual([
      'https://aistudio.google.com/apikey',
      'https://platform.openai.com/api-keys',
      'https://console.anthropic.com/settings/keys',
    ]);
    expect(PROVIDERS.filter((p) => p.free).map((p) => p.id)).toEqual(['google']);
    expect(providerInfo('crux')).toBeNull();
  });
});

/**
 * The Connect step is one field: the provider is read off the key. `sk-ant-`
 * is Anthropic, `AIza` is Google, any other `sk-` is OpenAI; anything else is
 * nobody's, and the step says so in one line.
 */
describe('detectProvider', () => {
  it('reads the provider off the key prefix', () => {
    expect(detectProvider('sk-ant-api03-abc')).toBe('anthropic');
    expect(detectProvider('sk-ant-')).toBe('anthropic');
    expect(detectProvider('AIzaSyD-xyz')).toBe('google');
    expect(detectProvider('sk-proj-abc')).toBe('openai');
    expect(detectProvider('sk-abc')).toBe('openai');
    expect(detectProvider('sk-')).toBe('openai');
  });

  it('forgives whitespace around a pasted key', () => {
    expect(detectProvider('  sk-ant-x\n')).toBe('anthropic');
    expect(detectProvider('\tAIzaX ')).toBe('google');
  });

  it('places nothing it does not know: empty, other vendors, near misses', () => {
    expect(detectProvider('')).toBeNull();
    expect(detectProvider('   ')).toBeNull();
    expect(detectProvider('hunter2')).toBeNull();
    expect(detectProvider('SK-ANT-abc')).toBeNull(); // prefixes are case-sensitive
    expect(detectProvider('aiza-abc')).toBeNull();
    expect(detectProvider('sk_ant_abc')).toBeNull();
    expect(detectProvider('xai-abc')).toBeNull();
    expect(detectProvider('gsk_abc')).toBeNull();
    expect(UNKNOWN_KEY_MESSAGE).toBe(
      'That doesn’t look like a key from Anthropic, OpenAI or Google.',
    );
  });
});

/**
 * The opening line is how a pasted key gets validated: a refusal from the
 * provider sends the visitor back to the step with the provider named.
 */
describe('isAuthError and refusedMessage', () => {
  const apiError = (statusCode: number, message = 'nope', responseBody?: string) =>
    Object.assign(new Error(message), { statusCode, responseBody });

  it('recognises 401 and 403 from any provider', () => {
    expect(isAuthError(apiError(401, 'invalid x-api-key'))).toBe(true);
    expect(isAuthError(apiError(403, 'Forbidden'))).toBe(true);
  });

  it("recognises Google's 400 that talks about the key, and no other 400", () => {
    expect(isAuthError(apiError(400, 'API key not valid. Please pass a valid API key.'))).toBe(
      true,
    );
    expect(
      isAuthError(
        apiError(
          400,
          'Bad Request',
          '{"error":{"message":"API_KEY_INVALID","status":"INVALID_ARGUMENT"}}',
        ),
      ),
    ).toBe(true);
    expect(isAuthError(apiError(400, 'temperature must be between 0 and 2'))).toBe(false);
  });

  it('leaves every other failure alone — those are failed moves, not bad keys', () => {
    expect(isAuthError(apiError(429, 'rate limited'))).toBe(false);
    expect(isAuthError(apiError(500, 'boom'))).toBe(false);
    expect(isAuthError(apiError(402, 'insufficient credits'))).toBe(false);
    expect(isAuthError(new Error('network down'))).toBe(false);
    expect(isAuthError(new Error('invalid api key'))).toBe(false); // no status: not a refusal we can trust
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError('401')).toBe(false);
  });

  it('names the provider in the sentence the step shows', () => {
    expect(refusedMessage('anthropic')).toBe('That key was refused by Anthropic.');
    expect(refusedMessage('google')).toBe('That key was refused by Google.');
    expect(refusedMessage('openai')).toBe('That key was refused by OpenAI.');
    expect(refusedMessage('crux')).toBe('That key was refused by the provider.');
  });
});
