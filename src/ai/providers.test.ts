import { describe, it, expect } from 'vitest';
import { PROVIDERS, getProviderForModel } from './providers';

describe('PROVIDERS', () => {
  it('has anthropic with Claude models', () => {
    expect(PROVIDERS.anthropic).toBeDefined();
    expect(PROVIDERS.anthropic!.name).toBe('Anthropic');
    expect(PROVIDERS.anthropic!.models.length).toBeGreaterThan(0);
  });

  it('has openai with GPT models', () => {
    expect(PROVIDERS.openai).toBeDefined();
    expect(PROVIDERS.openai!.name).toBe('OpenAI');
    expect(PROVIDERS.openai!.models.length).toBeGreaterThan(0);
  });
});

describe('getProviderForModel', () => {
  it('returns anthropic for Claude models', () => {
    expect(getProviderForModel('claude-sonnet-4-20250514')).toBe('anthropic');
    expect(getProviderForModel('claude-haiku-4-20250414')).toBe('anthropic');
    expect(getProviderForModel('claude-opus-4-20250514')).toBe('anthropic');
  });

  it('returns openai for GPT models', () => {
    expect(getProviderForModel('gpt-4o')).toBe('openai');
    expect(getProviderForModel('gpt-4o-mini')).toBe('openai');
  });

  it('returns openai for o3/o4 models', () => {
    expect(getProviderForModel('o3-mini')).toBe('openai');
    expect(getProviderForModel('o4-mini')).toBe('openai');
  });

  it('defaults to anthropic for unknown models', () => {
    expect(getProviderForModel('some-unknown-model')).toBe('anthropic');
  });
});

describe('September model refresh', () => {
  it('routes included requests separately from BYOK and preserves existing choices', () => {
    expect(getProviderForModel('garden-included')).toBe('included');
    expect(getProviderForModel('gpt-6-astra')).toBe('openai');
    expect(PROVIDERS.openai!.models.some((m) => m.id === 'gpt-6-astra')).toBe(true);
    expect(PROVIDERS.anthropic!.models.some((m) => m.id === 'claude-fable-5-1')).toBe(true);
    expect(PROVIDERS.google!.models.map((m) => m.id)).toEqual(
      expect.arrayContaining(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash']),
    );
  });
});
