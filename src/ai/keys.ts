import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting, removeSetting } from '@/services/settings';

const KEY_PREFIX = 'cruxgarden:apiKey:';

/**
 * Get an API key from localStorage.
 * Falls back to SQLite settings for migration from the old storage location.
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  const key = KEY_PREFIX + providerId;
  const value = localStorage.getItem(key);
  if (value) return value;

  // Migration fallback: check SQLite settings (old location)
  try {
    const sqliteValue = getSetting(key);
    if (sqliteValue) {
      // Migrate to localStorage and remove from SQLite
      localStorage.setItem(key, sqliteValue);
      removeSetting(key);
      return sqliteValue;
    }
  } catch { /* SQLite not ready — skip migration */ }

  return null;
}

/** Save an API key to localStorage */
export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
  localStorage.setItem(KEY_PREFIX + providerId, apiKey);
}

/** Remove an API key from localStorage */
export async function removeApiKey(providerId: string): Promise<void> {
  localStorage.removeItem(KEY_PREFIX + providerId);
}

/** Get the default model from settings, or return the fallback */
export async function getDefaultModel(): Promise<string> {
  return getSetting(SettingsKey.DefaultModel) || 'claude-sonnet-4-20250514';
}

/** Save the default model to settings */
export async function setDefaultModel(model: string): Promise<void> {
  setSetting(SettingsKey.DefaultModel, model);
}

