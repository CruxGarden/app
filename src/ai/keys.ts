import { SettingsKey, API_KEY_PREFIX } from '@/lib/constants';
import { getSetting, setSetting, removeSetting } from '@/services/settings';
import { getSecret, setSecret, deleteSecret } from '@/services/secrets';

/**
 * Get an API key from the platform secret store (safeStorage on desktop,
 * localStorage on web). Falls back to SQLite settings for migration from
 * the old storage location.
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  const key = API_KEY_PREFIX + providerId;
  const value = await getSecret(key);
  if (value) return value;

  // Migration fallback: check SQLite settings (old location)
  try {
    const sqliteValue = getSetting(key);
    if (sqliteValue) {
      // Migrate to the secret store and remove from SQLite
      await setSecret(key, sqliteValue);
      removeSetting(key);
      return sqliteValue;
    }
  } catch { /* SQLite not ready — skip migration */ }

  return null;
}

/** Save an API key to the platform secret store */
export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
  await setSecret(API_KEY_PREFIX + providerId, apiKey);
}

/** Remove an API key from the platform secret store */
export async function removeApiKey(providerId: string): Promise<void> {
  await deleteSecret(API_KEY_PREFIX + providerId);
}

/** Get the default model from settings, or return the fallback */
export async function getDefaultModel(): Promise<string> {
  return getSetting(SettingsKey.DefaultModel) || 'claude-sonnet-4-20250514';
}

/** Save the default model to settings */
export async function setDefaultModel(model: string): Promise<void> {
  setSetting(SettingsKey.DefaultModel, model);
}

