import { describe, it, expect, beforeEach } from 'vitest';
import { initSettings, setSetting, getSetting, clearAllSettings } from './settings';
import { getSqliteClient } from './sqlite/client';
import { SettingsKey } from '@/lib/constants';

const ANTHROPIC_KEY = SettingsKey.ApiKeyAnthropic; // 'cruxgarden:apiKey:anthropic'

async function sqliteSettingRows(): Promise<Map<string, string>> {
  const db = getSqliteClient();
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function seedSqliteSetting(key: string, value: string): Promise<void> {
  const db = getSqliteClient();
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

describe('Settings secrets exclusion', () => {
  beforeEach(() => {
    clearAllSettings();
  });

  it('purges a leaked API key row from SQLite and lifts it to localStorage', async () => {
    await seedSqliteSetting(ANTHROPIC_KEY, 'sk-ant-leaked');
    await initSettings();

    const rows = await sqliteSettingRows();
    expect(rows.has(ANTHROPIC_KEY)).toBe(false);
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBe('sk-ant-leaked');
    // Not readable via settings either — secrets are not settings
    expect(getSetting(ANTHROPIC_KEY)).toBeNull();
  });

  it('purges the legacy unprefixed API key row under the canonical name', async () => {
    await seedSqliteSetting('apiKey:anthropic', 'sk-ant-legacy');
    await initSettings();

    const rows = await sqliteSettingRows();
    expect(rows.has('apiKey:anthropic')).toBe(false);
    expect(rows.has(ANTHROPIC_KEY)).toBe(false);
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBe('sk-ant-legacy');
  });

  it('never clobbers a newer localStorage key while purging', async () => {
    localStorage.setItem(ANTHROPIC_KEY, 'sk-ant-current');
    await seedSqliteSetting(ANTHROPIC_KEY, 'sk-ant-stale');
    await initSettings();

    expect(localStorage.getItem(ANTHROPIC_KEY)).toBe('sk-ant-current');
    expect((await sqliteSettingRows()).has(ANTHROPIC_KEY)).toBe(false);
  });

  it('does not sweep API keys or auth tokens from localStorage into SQLite', async () => {
    localStorage.setItem(ANTHROPIC_KEY, 'sk-ant-local');
    localStorage.setItem('cruxgarden:apiKey:openai', 'sk-openai-local');
    localStorage.setItem(SettingsKey.AccessToken, 'jwt-access');
    localStorage.setItem(SettingsKey.Theme, 'dark');
    await initSettings();

    const rows = await sqliteSettingRows();
    expect(rows.has(ANTHROPIC_KEY)).toBe(false);
    expect(rows.has('cruxgarden:apiKey:openai')).toBe(false);
    expect(rows.has(SettingsKey.AccessToken)).toBe(false);
    // Non-secret settings still migrate
    expect(rows.get(SettingsKey.Theme)).toBe('dark');
    // Secrets stay where they were
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBe('sk-ant-local');
  });

  it('setSetting refuses to persist a secret to SQLite', async () => {
    await initSettings();
    setSetting(ANTHROPIC_KEY, 'sk-ant-via-settings');
    // Fire-and-forget writes: give the event loop a tick
    await new Promise((r) => setTimeout(r, 10));

    expect((await sqliteSettingRows()).has(ANTHROPIC_KEY)).toBe(false);
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBe('sk-ant-via-settings');
  });

  it('a garden export after init contains no API key rows', async () => {
    await seedSqliteSetting(ANTHROPIC_KEY, 'sk-ant-leaked');
    await initSettings();

    // The backup serializes the DB wholesale — assert at the source of truth
    const rows = await sqliteSettingRows();
    for (const key of rows.keys()) {
      expect(key).not.toContain('apiKey:');
      expect(key).not.toContain('accessToken');
      expect(key).not.toContain('refreshToken');
    }
  });
});
