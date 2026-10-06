import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localSecrets, setLocalSecret } from './function-secrets';
import { compose } from './containers';
import { FN_SECRETS_PREFIX } from '@/lib/constants';

const saved = new Map<string, string>();
let writeFails = false;
beforeEach(() => {
  saved.clear();
  writeFails = false;
  (globalThis as Record<string, unknown>).window = {
    electronAPI: {
      secrets: {
        get: async (key: string) => saved.get(key) ?? null,
        set: async (key: string, value: string) => {
          if (writeFails) throw new Error('Could not save credentials');
          saved.set(key, value);
        },
        delete: async (key: string) => void saved.delete(key),
      },
    },
  };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
});

describe('local Function secrets', () => {
  it('persists through the native store, retaining concurrent edits and separate Crux ownership', async () => {
    await Promise.all([
      setLocalSecret('first', 'TOKEN', 'one'),
      setLocalSecret('first', '__proto__', 'two'),
      setLocalSecret('second', 'TOKEN', 'three'),
    ]);
    expect(saved.has(FN_SECRETS_PREFIX + 'first')).toBe(true);
    expect(localStorage.getItem(FN_SECRETS_PREFIX + 'first')).toBeNull();
    expect(await localSecrets('first')).toEqual(JSON.parse('{"TOKEN":"one","__proto__":"two"}'));
    expect(await localSecrets('second')).toEqual({ TOKEN: 'three' });
    await setLocalSecret('first', 'TOKEN', null);
    expect(await localSecrets('first')).toEqual(JSON.parse('{"__proto__":"two"}'));
  });

  it('preserves committed values on failure and lets the next queued edit succeed', async () => {
    await setLocalSecret('first', 'TOKEN', 'one');
    writeFails = true;
    await expect(async () => setLocalSecret('first', 'TOKEN', 'replacement')).rejects.toThrow(
      'Could not save',
    );
    writeFails = false;
    await setLocalSecret('first', 'OTHER', 'two');
    expect(await localSecrets('first')).toEqual({ TOKEN: 'one', OTHER: 'two' });
  });

  it('refuses malformed saved maps and invalid names instead of replacing them', async () => {
    const key = FN_SECRETS_PREFIX + 'first';
    for (const raw of ['{damaged', '[]', '{"TOKEN":42}', '{"bad name":"value"}']) {
      saved.set(key, raw);
      await expect(async () => localSecrets('first')).rejects.toThrow('stored Function secrets');
      await expect(async () => setLocalSecret('first', 'TOKEN', 'new')).rejects.toThrow(
        'stored Function secrets',
      );
      expect(saved.get(key)).toBe(raw);
    }
    saved.delete(key);
    await expect(async () => setLocalSecret('first', 'bad name', 'new')).rejects.toThrow(
      'secret name',
    );
    expect(saved.has(key)).toBe(false);
  });
  it('passes only the owning Crux secrets to starts, while controls work with a locked vault', async () => {
    const requests: Array<{ verb: string; env: Record<string, string> }> = [];
    const api = (
      globalThis as unknown as {
        window: {
          electronAPI: {
            secrets: { get: (key: string) => Promise<string | null> };
            containers?: unknown;
          };
        };
      }
    ).window.electronAPI;
    api.containers = {
      compose: async (request: { verb: string; env: Record<string, string> }) => {
        requests.push(request);
        return { code: 0, output: '' };
      },
    };
    await setLocalSecret('first', 'TOKEN', 'one');
    await setLocalSecret('second', 'TOKEN', 'two');
    await compose('first', 'up');
    expect(requests[0]?.env).toEqual({ TOKEN: 'one' });
    api.secrets.get = async () => {
      throw new Error('Keychain locked');
    };
    for (const verb of ['stop', 'down', 'ps', 'logs'] as const) await compose('first', verb);
    expect(requests.slice(1).every((request) => Object.keys(request.env).length === 0)).toBe(true);
    await expect(compose('first', 'up')).rejects.toThrow('Keychain locked');
    expect(requests).toHaveLength(5);
  });
});
