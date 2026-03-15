// Lazy import to avoid pulling SQLite worker into public pages
async function db() {
  const { getSqliteClient } = await import('@/services/sqlite/client');
  return getSqliteClient();
}

/**
 * Get an API key from SQLite settings.
 * Keys are stored in SQLite (via OPFS) — the preview iframe on a different
 * origin can't access them.
 */
export async function getApiKey(providerId: string): Promise<string | null> {
  const row = await (await db()).get<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [`cruxgarden:apiKey:${providerId}`],
  );
  return row?.value || null;
}

/** Save an API key to SQLite settings */
export async function setApiKey(providerId: string, key: string): Promise<void> {
  await (await db()).run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`cruxgarden:apiKey:${providerId}`, key],
  );
}

/** Remove an API key from SQLite settings */
export async function removeApiKey(providerId: string): Promise<void> {
  await (await db()).run('DELETE FROM settings WHERE key = ?', [`cruxgarden:apiKey:${providerId}`]);
}

/** Get the default model from settings, or return the fallback */
export async function getDefaultModel(): Promise<string> {
  const row = await (await db()).get<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'cruxgarden:defaultModel'",
  );
  return row?.value || 'claude-sonnet-4-20250514';
}

/** Save the default model to settings */
export async function setDefaultModel(model: string): Promise<void> {
  await (await db()).run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('cruxgarden:defaultModel', ?)",
    [model],
  );
}

/**
 * Migrate API key from localStorage to SQLite settings.
 * Called once on first init. Removes from localStorage after migration.
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
