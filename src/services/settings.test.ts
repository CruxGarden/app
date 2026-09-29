import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initSettings,
  setSetting,
  getSetting,
  clearAllSettings,
  setSettingDurably,
  flushSettings,
} from './settings';
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

  it('does not expose or move credential rows while loading ordinary preferences', async () => {
    await seedSqliteSetting(ANTHROPIC_KEY, 'fixture-kept-on-disk');
    await seedSqliteSetting(SettingsKey.AuthSession, 'fixture-account-pair');
    await seedSqliteSetting(SettingsKey.Theme, 'dark');
    await initSettings();
    expect(getSetting(ANTHROPIC_KEY)).toBeNull();
    expect(getSetting(SettingsKey.AuthSession)).toBeNull();
    expect(getSetting(SettingsKey.Theme)).toBe('dark');
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBeNull();
    expect(localStorage.getItem(SettingsKey.AuthSession)).toBeNull();
    const rows = await sqliteSettingRows();
    expect(rows.get(ANTHROPIC_KEY)).toBe('fixture-kept-on-disk');
    expect(rows.get(SettingsKey.AuthSession)).toBe('fixture-account-pair');
  });

  it('leaves existing plaintext untouched and inaccessible as settings', async () => {
    localStorage.setItem(ANTHROPIC_KEY, 'fixture-current');
    await seedSqliteSetting(ANTHROPIC_KEY, 'fixture-earlier');
    await initSettings();
    expect(getSetting(ANTHROPIC_KEY)).toBeNull();
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBe('fixture-current');
    expect((await sqliteSettingRows()).get(ANTHROPIC_KEY)).toBe('fixture-earlier');
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
    expect(() => setSetting(ANTHROPIC_KEY, 'sk-ant-via-settings')).toThrow(
      'encrypted credential storage',
    );
    // Fire-and-forget writes: give the event loop a tick
    await new Promise((r) => setTimeout(r, 10));

    expect((await sqliteSettingRows()).has(ANTHROPIC_KEY)).toBe(false);
    expect(localStorage.getItem(ANTHROPIC_KEY)).toBeNull();
  });
});

it('durable markers reject their own failed write even when another consumer flushes concurrently', async () => {
  await initSettings();
  const key = 'cruxgarden:pending-open:write-proof';
  await setSettingDurably(key, 'queued');
  const db = getSqliteClient();
  const run = vi.spyOn(db, 'run').mockRejectedValueOnce(new Error('disk full'));
  const operation = setSettingDurably(key, 'dispatched');
  const flush = flushSettings().catch(() => {});
  await expect(operation).rejects.toThrow('disk full');
  await flush;
  expect(getSetting(key)).toBe('queued');
  run.mockRestore();
  expect((await sqliteSettingRows()).get(key)).toBe('queued');
  await setSettingDurably(key, 'dispatched');
  expect((await sqliteSettingRows()).get(key)).toBe('dispatched');
  expect(getSetting(key)).toBe('dispatched');
});

it('never exposes reserved plaintext keys before initialization', async () => {
  vi.resetModules();
  const fresh = await import('./settings');
  localStorage.setItem(SettingsKey.AccessToken, 'fixture-unbound-access');
  localStorage.setItem(SettingsKey.AuthSession, 'fixture-misplaced-pair');
  expect(fresh.getSetting(SettingsKey.AccessToken)).toBeNull();
  expect(fresh.getSetting(SettingsKey.AuthSession)).toBeNull();
  expect(localStorage.getItem(SettingsKey.AccessToken)).toBe('fixture-unbound-access');
});
