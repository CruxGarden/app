import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSecret, setSecret, deleteSecret } from './secrets';

/** In-memory fake of the Electron safeStorage IPC bridge. */
function fakeElectronSecrets(available = true) {
  const store = new Map<string, string>();
  return {
    store,
    api: {
      available: async () => available,
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string) => {
        if (!available) throw new Error('Secure credential storage is unavailable');
        store.set(key, value);
      },
      delete: async (key: string) => void store.delete(key),
    },
  };
}

function installWindow(secrets: object | undefined) {
  (globalThis as Record<string, unknown>).window = secrets ? { electronAPI: { secrets } } : {};
}

describe('secrets service', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  describe('web (no Electron bridge)', () => {
    it('refuses new plaintext and preserves existing data without using it', async () => {
      installWindow(undefined);
      await expect(setSecret('key', 'new')).rejects.toThrow('desktop app');
      expect(localStorage.getItem('key')).toBeNull();
      expect(await getSecret('key')).toBeNull();
      localStorage.setItem('key', 'existing');
      await expect(getSecret('key')).rejects.toThrow('desktop app');
      expect(localStorage.getItem('key')).toBe('existing');
      await deleteSecret('key');
      expect(await getSecret('key')).toBeNull();
    });
  });

  describe('desktop (safeStorage bridge available)', () => {
    it('reads a missing key without probing Keychain availability', async () => {
      const fake = fakeElectronSecrets();
      const available = vi.fn(async () => false);
      const get = vi.fn(fake.api.get);
      installWindow({ ...fake.api, available, get });

      expect(await getSecret('missing')).toBeNull();
      expect(get).toHaveBeenCalledWith('missing');
      expect(available).not.toHaveBeenCalled();
    });

    it('prefers the native value without an extra availability probe', async () => {
      const fake = fakeElectronSecrets();
      fake.store.set('key', 'encrypted-value');
      localStorage.setItem('key', 'stale-value');
      const available = vi.fn(async () => false);
      installWindow({ ...fake.api, available });

      expect(await getSecret('key')).toBe('encrypted-value');
      expect(available).not.toHaveBeenCalled();
    });

    it('deletes native and legacy values without requiring Keychain access', async () => {
      const fake = fakeElectronSecrets();
      fake.store.set('key', 'encrypted-value');
      localStorage.setItem('key', 'legacy-value');
      const available = vi.fn(async () => false);
      installWindow({ ...fake.api, available });

      await deleteSecret('key');
      expect(fake.store.has('key')).toBe(false);
      expect(localStorage.getItem('key')).toBeNull();
      expect(available).not.toHaveBeenCalled();
    });

    it('preserves a legacy value if encrypted migration fails', async () => {
      const fake = fakeElectronSecrets();
      installWindow({
        ...fake.api,
        set: async () => {
          throw new Error('Keychain locked');
        },
      });
      localStorage.setItem('key', 'legacy-value');

      await expect(getSecret('key')).rejects.toThrow('Keychain locked');
      expect(localStorage.getItem('key')).toBe('legacy-value');
      expect(fake.store.has('key')).toBe(false);
    });

    it('does not fall back or remove plaintext when native reads or deletes fail', async () => {
      const fake = fakeElectronSecrets();
      localStorage.setItem('key', 'existing');
      installWindow({
        ...fake.api,
        get: async () => {
          throw new Error('Cannot unlock stored credentials');
        },
        delete: async () => {
          throw new Error('Could not save credentials');
        },
      });
      await expect(getSecret('key')).rejects.toThrow('Cannot unlock');
      await expect(deleteSecret('key')).rejects.toThrow('Could not save');
      expect(localStorage.getItem('key')).toBe('existing');
      expect(fake.store.size).toBe(0);
    });

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
    it('reports failure without overwriting either store and allows a later retry', async () => {
      const fake = fakeElectronSecrets(false);
      installWindow(fake.api);
      localStorage.setItem('key', 'existing');
      await expect(setSecret('key', 'new')).rejects.toThrow('unavailable');
      await expect(getSecret('key')).rejects.toThrow('unavailable');
      expect(fake.store.size).toBe(0);
      expect(localStorage.getItem('key')).toBe('existing');
      const recovered = fakeElectronSecrets();
      installWindow(recovered.api);
      expect(await getSecret('key')).toBe('existing');
      expect(recovered.store.get('key')).toBe('existing');
      expect(localStorage.getItem('key')).toBeNull();
    });
  });
});
