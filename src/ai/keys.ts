import { db } from '@/services/dexie/schema';

/**
 * Get an API key from Dexie settings.
 * Keys are stored in IndexedDB (not localStorage) because IndexedDB is
 * origin-scoped — the preview iframe on a different origin can't access them.
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  const row = await db.settings.get(`apiKey:${providerId}`);
  return (row?.value as string) || null;
}

/** Save an API key to Dexie settings */
export async function setApiKey(
  providerId: string,
  key: string,
): Promise<void> {
  await db.settings.put({ key: `apiKey:${providerId}`, value: key });
}

/** Remove an API key from Dexie settings */
export async function removeApiKey(providerId: string): Promise<void> {
  await db.settings.delete(`apiKey:${providerId}`);
}

/** Get the default model from settings, or return the fallback */
export async function getDefaultModel(): Promise<string> {
  const row = await db.settings.get('defaultModel');
  return (row?.value as string) || 'claude-sonnet-4-20250514';
}

/** Save the default model to settings */
export async function setDefaultModel(model: string): Promise<void> {
  await db.settings.put({ key: 'defaultModel', value: model });
}

/**
 * Migrate API key from localStorage to Dexie settings.
 * Called once on first Dexie init. Removes from localStorage after migration.
 */
export async function migrateApiKeyFromLocalStorage(): Promise<void> {
  const legacyKey = localStorage.getItem('cruxgarden:anthropicApiKey');
  if (legacyKey) {
    const existing = await getApiKey('anthropic');
    if (!existing) {
      await setApiKey('anthropic', legacyKey);
    }
    localStorage.removeItem('cruxgarden:anthropicApiKey');
  }
}
