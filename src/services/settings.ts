/**
 * Settings service — unified key/value store backed by SQLite.
 *
 * Provides synchronous reads from an in-memory cache and async writes to SQLite.
 * On init, migrates any existing localStorage values into SQLite so exports
 * capture all user preferences and workspace state.
 *
 * For values needed before services init (theme, background), localStorage is
 * still written as a sync fallback to prevent flash on cold start.
 */

import { getSqliteClient } from './sqlite/client';
import { SettingsKey, isSecretSettingKey } from '@/lib/constants';

const cache = new Map<string, string>();
let ready = false;

// Keys that must be readable synchronously before services init (written to
// localStorage as a cache so the first paint uses the right theme/background).
const SYNC_KEYS: Set<string> = new Set([
  SettingsKey.Theme,
  SettingsKey.Tint,
  SettingsKey.BackgroundType,
  SettingsKey.BackgroundImage,
  SettingsKey.BackgroundBlockSize,
  SettingsKey.MoodPresetDark,
  SettingsKey.MoodPresetLight,
]);

// ── Public API ──────────────────────────────────────────────────────────────

/** Read a setting synchronously from the in-memory cache. */
export function getSetting(key: string): string | null {
  // Cache is authoritative once a value is present (covers pre-init writes)
  if (cache.has(key)) return cache.get(key)!;
  if (ready) return null;
  // Before init, fall back to localStorage for sync keys
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
}

/** Write a setting to cache + SQLite (async) + localStorage (sync fallback). */
export function setSetting(key: string, value: string): void {
  // Secrets never enter the SQLite settings table (it is serialized wholesale
  // into garden backups/exports) — store in localStorage only. See ai/keys.ts.
  if (isSecretSettingKey(key)) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }

  cache.set(key, value);

  // Sync fallback for pre-init reads
  if (SYNC_KEYS.has(key) && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }

  // Async persist to SQLite (fire-and-forget)
  if (ready) {
    const db = getSqliteClient();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]).catch(
      () => {},
    );
  }
}

/** Remove a setting from cache + SQLite + localStorage. */
export function removeSetting(key: string): void {
  cache.delete(key);

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }

  if (ready) {
    const db = getSqliteClient();
    db.run('DELETE FROM settings WHERE key = ?', [key]).catch(() => {});
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

/** Load all settings from SQLite and migrate localStorage values. */
export async function initSettings(): Promise<void> {
  const db = getSqliteClient();

  // 1. Load existing SQLite settings into cache
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  for (const row of rows) {
    cache.set(row.key, row.value);
  }

  // 2. Migrate unprefixed SQLite keys → cruxgarden: prefixed (one-time)
  // Secrets are deliberately absent — they are purged from SQLite below.
  const LEGACY_KEY_MAP: [string, string][] = [
    ['local:authorId', SettingsKey.LocalAuthorIdLegacy],
    ['local:homeId', SettingsKey.LocalHomeId],
    ['backend', SettingsKey.Backend],
    ['localAuthorId', SettingsKey.LocalAuthorId],
    ['defaultModel', SettingsKey.DefaultModel],
  ];
  for (const [oldKey, newKey] of LEGACY_KEY_MAP) {
    if (cache.has(oldKey) && !cache.has(newKey)) {
      const value = cache.get(oldKey)!;
      cache.set(newKey, value);
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [newKey, value]);
      await db.run('DELETE FROM settings WHERE key = ?', [oldKey]);
      cache.delete(oldKey);
    }
  }

  // 3. Purge secrets from SQLite. API keys were historically swept into the
  // settings table (and thus into every garden backup via db.export()) —
  // lift them back to localStorage, then delete the rows so no export
  // surface can ever contain them.
  for (const [key, value] of [...cache.entries()]) {
    if (!isSecretSettingKey(key)) continue;
    if (typeof localStorage !== 'undefined') {
      // Preserve under the canonical prefixed name; never clobber a newer value
      const canonical = key === 'apiKey:anthropic' ? SettingsKey.ApiKeyAnthropic : key;
      if (key !== SettingsKey.LegacyAnthropicApiKey && !localStorage.getItem(canonical)) {
        localStorage.setItem(canonical, value);
      }
    }
    cache.delete(key);
    await db.run('DELETE FROM settings WHERE key = ?', [key]);
  }

  // 4. Migrate localStorage → SQLite (one-time: only if key isn't already in SQLite)
  if (typeof localStorage !== 'undefined') {
    const toMigrate: [string, string][] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('cruxgarden:')) continue;
      // Secrets (API keys, auth tokens) never enter SQLite — see isSecretSettingKey
      if (isSecretSettingKey(key)) continue;
      // Skip legacy keys that no longer exist
      if (key === SettingsKey.LegacyUi) continue;

      if (!cache.has(key)) {
        const value = localStorage.getItem(key);
        if (value !== null) {
          cache.set(key, value);
          toMigrate.push([key, value]);
        }
      }
    }

    // Batch write migrated values
    for (const [key, value] of toMigrate) {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  ready = true;
}

/** Whether the settings cache has been populated from SQLite. */
export function isSettingsReady(): boolean {
  return ready;
}

/** Clear the in-memory cache and remove all cruxgarden: keys from localStorage. */
export function clearAllSettings(): void {
  cache.clear();

  if (typeof localStorage !== 'undefined') {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('cruxgarden:')) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  }
}
