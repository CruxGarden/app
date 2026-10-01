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

/** Where settings persist: named API commands on desktop, the worker's table in Web Mode. */
function table() {
  const db = getSqliteClient();
  if (db.settings) return db.settings;
  return {
    list: () => db.all<{ key: string; value: string }>('SELECT key, value FROM settings'),
    put: async (key: string, value: string) => {
      await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    },
    remove: async (key: string) => {
      await db.run('DELETE FROM settings WHERE key = ?', [key]);
    },
  };
}
let ready = false;
let writes: Promise<void> = Promise.resolve();
let writeFailure: unknown;
export async function flushSettings(): Promise<void> {
  await writes;
  if (writeFailure) {
    const error = writeFailure;
    writeFailure = undefined;
    throw error;
  }
}

// Keys that must be readable synchronously before services init (written to
// localStorage as a cache so the first paint uses the right theme/background).
const SYNC_KEYS: Set<string> = new Set([
  SettingsKey.ResumeWorkspace,
  SettingsKey.ExploreRecentTags,
  // The API address is read before anything talks to it (api/client.ts).
  SettingsKey.ApiUrl,
  SettingsKey.Theme,
  SettingsKey.Tint,
  SettingsKey.BackgroundType,
  SettingsKey.BackgroundImage,
  SettingsKey.BackgroundBlockSize,
  SettingsKey.MoodPresetDark,
  SettingsKey.MoodPresetLight,
  // The whole look, so the Gateway paints the worn Mood before services init:
  // the user presets (a bundled Mood's theme is one), the token overrides,
  // and which Mood Package is worn
  SettingsKey.MoodUserPresets,
  SettingsKey.MoodThemeDark,
  SettingsKey.MoodThemeLight,
  SettingsKey.WornMoodId,
  // …and its sound, so the Gateway can play the worn Mood's track before Enter
  SettingsKey.SoundTrack,
  SettingsKey.SynthPatch,
  SettingsKey.SynthPresetBanks,
  SettingsKey.WorkspaceLayouts,
  SettingsKey.SoundEnabled,
  SettingsKey.ResonanceVolume,
  SettingsKey.ResonanceOptIn,
  SettingsKey.ResonancePlaying,
  // The public website has no SQLite: the Mood it wears lives here
  SettingsKey.PublicMoodId,
]);

// ── Public API ──────────────────────────────────────────────────────────────

const changeListeners = new Set<(key: string) => void>();
/** Hear which setting changed (value writes and removals, not secrets). */
export function onSettingChange(fn: (key: string) => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}
function changed(key: string) {
  for (const fn of changeListeners) fn(key);
}

/** Read a setting synchronously from the in-memory cache. */
export function getSetting(key: string): string | null {
  if (isSecretSettingKey(key)) return null;
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
  if (isSecretSettingKey(key)) {
    throw new Error('Secrets must be saved through encrypted credential storage.');
  }

  const before = cache.get(key);
  cache.set(key, value);
  if (before !== value) changed(key);

  // Sync fallback for pre-init reads
  if (SYNC_KEYS.has(key) && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }

  // Async persist to SQLite (fire-and-forget)
  if (ready) {
    writes = writes
      .then(() => table().put(key, value))
      .catch((error) => {
        writeFailure = error;
      });
  }
}

/** A delivery marker must observe its own write result: a concurrent flush
 * cannot consume its failure. Publish to the cache only after this commit.
 */
export async function setSettingDurably(key: string, value: string): Promise<void> {
  if (!ready || isSecretSettingKey(key)) throw new Error('This setting cannot be persisted here.');
  const operation = writes.then(() => table().put(key, value));
  writes = operation
    .then(() => {})
    .catch((error) => {
      writeFailure = error;
    });
  await operation;
  const previous = cache.get(key);
  cache.set(key, value);
  if (SYNC_KEYS.has(key) && typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  if (previous !== value) changed(key);
}

/** Remove a setting from cache + SQLite + localStorage. */
export function removeSetting(key: string): void {
  const had = cache.delete(key);
  if (had) changed(key);

  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(key);
  }

  if (ready) {
    writes = writes
      .then(() => table().remove(key))
      .catch((error) => {
        writeFailure = error;
      });
  }
}

// ── Initialization ──────────────────────────────────────────────────────────

/** Load all settings from SQLite and migrate localStorage values. */
export async function initSettings(): Promise<void> {
  const store = table();

  // Credentials are not preferences. Ignore misplaced rows without moving
  // them into plaintext or deleting user data; the native owner excludes them
  // from both settings reads and exported database images.
  for (const row of await store.list()) {
    if (!isSecretSettingKey(row.key)) cache.set(row.key, row.value);
  }

  // Migrate localStorage → SQLite (one-time: only if key isn't already in SQLite)
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
    for (const [key, value] of toMigrate) await store.put(key, value);
  }

  ready = true;
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
