import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  DEFAULT_MODEL,
  getModelInfo,
  getProviderForModel,
  resolveModel,
} from './providers';

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

describe('September 30 model selection', () => {
  it('offers current defaults with usable context/output limits', () => {
    expect(DEFAULT_MODEL).toBe('claude-opus-5-5');
    expect(PROVIDERS.openai!.defaultModel).toBe('gpt-6.1-sol');
    expect(PROVIDERS.google!.defaultModel).toBe('gemini-3.8-flash');
    for (const id of ['claude-opus-5-5', 'claude-sonnet-5-5', 'gpt-6.1-sol', 'gpt-6-luna']) {
      expect(getModelInfo(id)).toMatchObject({ id, maxOutput: 128000 });
      expect(getModelInfo(id)!.contextWindow).toBeGreaterThanOrEqual(1000000);
    }
  });

  it('upgrades previous Claude choices within their tier without changing external agents or local models', () => {
    expect(resolveModel('claude-opus-5')).toBe('claude-opus-5-5');
    expect(resolveModel('claude-sonnet-5')).toBe('claude-sonnet-5-5');
    expect(resolveModel('claude-sonnet-4-20250514')).toBe('claude-sonnet-5-5');
    for (const id of [
      'garden-included',
      'codex',
      'claude-code',
      'ollama:qwen3',
      'custom-model',
      'gpt-5.6-terra',
    ]) {
      expect(resolveModel(id)).toBe(id);
    }
  });
});
