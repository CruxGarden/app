/**
 * Secret storage (BYOK API keys) — platform-aware.
 *
 * Desktop: Electron safeStorage via IPC (Keychain-backed encryption, main
 * process only). Web: localStorage. Secrets NEVER enter the SQLite settings
 * table — see isSecretSettingKey() in lib/constants and the settings service.
 * Existing localStorage values are migrated into safeStorage on first read.
 */

interface ElectronSecretsAPI {
  available(): Promise<boolean>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

function electronSecrets(): ElectronSecretsAPI | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { electronAPI?: { secrets?: ElectronSecretsAPI } }).electronAPI
    ?.secrets ?? null;
}

let availabilityCheck: Promise<ElectronSecretsAPI | null> | null = null;

/** The safeStorage-backed API, or null when unavailable (web, or no keychain). */
function backend(): Promise<ElectronSecretsAPI | null> {
  if (!availabilityCheck) {
    availabilityCheck = (async () => {
      const api = electronSecrets();
      if (!api) return null;
      try {
        return (await api.available()) ? api : null;
      } catch {
        return null;
      }
    })();
  }
  return availabilityCheck;
}

/** Reset the memoized backend probe (tests only). */
export function __resetSecretsBackendForTests(): void {
  availabilityCheck = null;
}

export async function getSecret(key: string): Promise<string | null> {
  const api = await backend();
  const local = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

  if (!api) return local;

  const stored = await api.get(key);
  if (stored) return stored;

  // One-time migration: lift a pre-safeStorage localStorage value
  if (local) {
    await api.set(key, local);
    localStorage.removeItem(key);
    return local;
  }
  return null;
}

export async function setSecret(key: string, value: string): Promise<void> {
  const api = await backend();
  if (api) {
    await api.set(key, value);
    // Clear any stale plaintext copy
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return;
  }
  if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  const api = await backend();
  if (api) await api.delete(key);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}
