import { describe, it, expect } from 'vitest';
import { getApiKey, setApiKey, removeApiKey, getDefaultModel, setDefaultModel } from './keys';

describe('API Key Management', () => {
  it('returns null when no key is stored', async () => {
    const key = await getApiKey('anthropic');
    expect(key).toBeNull();
  });

  it('stores and retrieves an API key', async () => {
    await setApiKey('anthropic', 'sk-ant-test-key');
    const key = await getApiKey('anthropic');
    expect(key).toBe('sk-ant-test-key');
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
  it('returns fallback when no model is stored', async () => {
    const model = await getDefaultModel();
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  it('stores and retrieves a default model', async () => {
    await setDefaultModel('gpt-4o');
    const model = await getDefaultModel();
    expect(model).toBe('gpt-4o');
  });
});
