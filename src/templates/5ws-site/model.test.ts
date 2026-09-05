import { describe, it, expect, afterEach } from 'vitest';
import type { LanguageModel } from 'ai';
import {
  PROVIDERS,
  injectedModel,
  modelFor,
  modelIdFor,
  providerInfo,
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

  it('lists the three connectable providers with a keys page each', () => {
    expect(PROVIDERS.map((p) => p.id)).toEqual(['anthropic', 'openai', 'google']);
    for (const p of PROVIDERS) expect(p.keysUrl).toMatch(/^https:\/\//);
    expect(providerInfo('crux')).toBeNull();
  });
});
