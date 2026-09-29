/**
 * Secret storage (BYOK API keys) — platform-aware.
 *
 * Desktop: Electron safeStorage via IPC (OS-backed encryption, main
 * process only). No plaintext fallback. Secrets NEVER enter the SQLite settings
 * table — see isSecretSettingKey() in lib/constants and the settings service.
 * Existing plaintext values are removed only after encrypted persistence succeeds.
 */

import type { SecretsBridge } from '@/lib/platform';

function electronSecrets(): SecretsBridge | null {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.secrets ?? null;
}

export async function getSecret(key: string): Promise<string | null> {
  // Native get checks the local entry before touching safeStorage. Probing
  // availability first can open a blocking macOS Keychain prompt even when
  // this installation has never saved a key.
  const api = electronSecrets();
  const local = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

  if (!api) {
    if (local !== null) throw new Error('Secure credential storage requires the desktop app.');
    return null;
  }

  const stored = await api.get(key);
  if (stored !== null) return stored;

  // Preserve a value written by the plaintext fallback until encryption succeeds.
  if (local !== null) {
    await api.set(key, local);
    localStorage.removeItem(key);
    return local;
  }
  return null;
}

export async function setSecret(key: string, value: string): Promise<void> {
  const api = electronSecrets();
  if (!api) throw new Error('Secure credential storage requires the desktop app.');
  // The native owner checks encryption on each operation. Never turn a failed
  // availability probe or IPC call into permission to write plaintext.
  await api.set(key, value);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}

export async function deleteSecret(key: string): Promise<void> {
  // Removing ciphertext from disk does not need encryption or decryption.
  const api = electronSecrets();
  if (api) await api.delete(key);
  if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
}
