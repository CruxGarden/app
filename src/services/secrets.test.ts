import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSecret, setSecret, deleteSecret, __resetSecretsBackendForTests } from './secrets';

/** In-memory fake of the Electron safeStorage IPC bridge. */
function fakeElectronSecrets(available = true) {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      available: async () => available,
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => void store.set(key, value),
      delete: async (key: string) => void store.delete(key),
    },
  };
}

function installWindow(secrets: object | undefined) {
  (globalThis as Record<string, unknown>).window = secrets ? { electronAPI: { secrets } } : {};
}

describe('secrets service', () => {
  beforeEach(() => {
    __resetSecretsBackendForTests();
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    __resetSecretsBackendForTests();
  });

  describe('web (no Electron bridge)', () => {
    it('stores and reads via localStorage', async () => {
      installWindow(undefined);
      await setSecret('cruxgarden:apiKey:anthropic', 'sk-web');
      expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBe('sk-web');
      expect(await getSecret('cruxgarden:apiKey:anthropic')).toBe('sk-web');

      await deleteSecret('cruxgarden:apiKey:anthropic');
      expect(await getSecret('cruxgarden:apiKey:anthropic')).toBeNull();
    });
  });

  describe('desktop (safeStorage bridge available)', () => {
    it('stores via safeStorage, never localStorage', async () => {
      const fake = fakeElectronSecrets();
      installWindow(fake.api);

      await setSecret('cruxgarden:apiKey:anthropic', 'sk-desktop');
      expect(fake.store.get('cruxgarden:apiKey:anthropic')).toBe('sk-desktop');
      expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBeNull();
      expect(await getSecret('cruxgarden:apiKey:anthropic')).toBe('sk-desktop');
    });

    it('migrates a pre-existing localStorage value into safeStorage on read', async () => {
      const fake = fakeElectronSecrets();
      installWindow(fake.api);
      localStorage.setItem('cruxgarden:apiKey:anthropic', 'sk-legacy');

      expect(await getSecret('cruxgarden:apiKey:anthropic')).toBe('sk-legacy');
      expect(fake.store.get('cruxgarden:apiKey:anthropic')).toBe('sk-legacy');
      expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBeNull();
    });

    it('clears stale localStorage plaintext on set', async () => {
      const fake = fakeElectronSecrets();
      installWindow(fake.api);
      localStorage.setItem('cruxgarden:apiKey:anthropic', 'sk-stale');

      await setSecret('cruxgarden:apiKey:anthropic', 'sk-new');
      expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBeNull();
      expect(await getSecret('cruxgarden:apiKey:anthropic')).toBe('sk-new');
    });

    it('deletes from both stores', async () => {
      const fake = fakeElectronSecrets();
      installWindow(fake.api);
      localStorage.setItem('cruxgarden:apiKey:anthropic', 'sk-stale');
      await setSecret('cruxgarden:apiKey:anthropic', 'sk-live');

      await deleteSecret('cruxgarden:apiKey:anthropic');
      expect(fake.store.size).toBe(0);
      expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBeNull();
    });
  });

  describe('desktop with keychain unavailable', () => {
    it('falls back to localStorage', async () => {
      const fake = fakeElectronSecrets(false);
      installWindow(fake.api);

      await setSecret('cruxgarden:apiKey:anthropic', 'sk-fallback');
      expect(fake.store.size).toBe(0);
      expect(localStorage.getItem('cruxgarden:apiKey:anthropic')).toBe('sk-fallback');
      expect(await getSecret('cruxgarden:apiKey:anthropic')).toBe('sk-fallback');
    });
  });
});
