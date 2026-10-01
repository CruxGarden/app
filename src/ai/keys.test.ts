import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getApiKey, setApiKey, removeApiKey, getDefaultModel, setDefaultModel } from './keys';
import { DEFAULT_MODEL } from './providers';

describe('API Key Management', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    // Exercise provider key naming through the renderer/native boundary.
    (globalThis as Record<string, unknown>).window = {
      electronAPI: {
        secrets: {
          get: async (key: string) => values.get(key) ?? null,
          set: async (key: string, value: string) => void values.set(key, value),
          delete: async (key: string) => void values.delete(key),
        },
      },
    };
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });
  it('returns null when no key is stored', async () => {
    const key = await getApiKey('anthropic');
    expect(key).toBeNull();
  });

  it('stores and retrieves an API key', async () => {
    await setApiKey('anthropic', 'sk-ant-test-key');
    const key = await getApiKey('anthropic');
    expect(key).toBe('sk-ant-test-key');
    expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBeNull();
  });

  it('stores keys per provider independently', async () => {
    await setApiKey('anthropic', 'sk-ant-123');
    await setApiKey('openai', 'sk-openai-456');

    expect(await getApiKey('anthropic')).toBe('sk-ant-123');
    expect(await getApiKey('openai')).toBe('sk-openai-456');
  });

  it('removes an API key', async () => {
    await setApiKey('anthropic', 'sk-ant-to-delete');
    expect(await getApiKey('anthropic')).toBe('sk-ant-to-delete');

    await removeApiKey('anthropic');
    expect(await getApiKey('anthropic')).toBeNull();
  });

  it('overwrites existing key', async () => {
    await setApiKey('anthropic', 'old-key');
    await setApiKey('anthropic', 'new-key');
    expect(await getApiKey('anthropic')).toBe('new-key');
  });
});

describe('Default Model', () => {
  it('returns the app default when no model is stored', async () => {
    const model = await getDefaultModel();
    expect(model).toBe(DEFAULT_MODEL);
  });

  it('stores and retrieves a default model (retired IDs upgrade on read)', async () => {
    await setDefaultModel('gpt-5.6-terra');
    expect(await getDefaultModel()).toBe('gpt-5.6-terra');

    // A retired ID stored by an older app version resolves to its successor
    await setDefaultModel('gpt-4o');
    expect(await getDefaultModel()).toBe('gpt-6.1-sol');
  });
});
