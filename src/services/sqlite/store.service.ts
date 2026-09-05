import { getSqliteClient } from './client';
import { fromRow } from './helpers';

// ── Types ────────────────────────────────────────────

/**
 * Key modes, chosen by the writer (the SDK's `set(key, value, { mode })`):
 * - `public` — one row per key belonging to the crux, read by anyone;
 * - `protected` — one row per (key, visitor), private to that visitor.
 * Every write on the published store needs a signed-in account; in the
 * preview the local user is always signed in, so this store does not ask.
 * Mirrors the API's Crux Store so the preview behaves like the published page.
 */
export type StoreMode = 'public' | 'protected';

/** `common` (the 2026-09-05 third bucket) is `public` now; anything unknown is the default, `protected`. */
export function normalizeStoreMode(mode: string | undefined | null): StoreMode {
  if (mode === 'public' || mode === 'common') return 'public';
  return 'protected';
}

export interface StoreEntry {
  id: string;
  cruxId: string;
  visitorId: string | null;
  key: string;
  value: unknown;
  mode: StoreMode;
  created: string;
  updated: string;
}

export interface IStoreService {
  get(cruxId: string, key: string, visitorId?: string | null): Promise<unknown | null>;
  set(
    cruxId: string,
    key: string,
    value: unknown,
    mode?: StoreMode,
    visitorId?: string | null,
  ): Promise<void>;
  increment(cruxId: string, key: string, by?: number, visitorId?: string | null): Promise<number>;
  delete(cruxId: string, key: string, visitorId?: string | null): Promise<void>;
  list(cruxId: string): Promise<StoreEntry[]>;
  clear(cruxId: string): Promise<void>;
}

// ── Helpers ──────────────────────────────────────────

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toStoreEntry(row: Record<string, unknown>): StoreEntry {
  const entry = fromRow<StoreEntry>(row);
  entry.value = typeof entry.value === 'string' ? parseValue(entry.value) : entry.value;
  entry.mode = normalizeStoreMode(entry.mode as string);
  return entry;
}

// ── Service ──────────────────────────────────────────

export class SqliteStoreService implements IStoreService {
  async get(cruxId: string, key: string, visitorId?: string | null): Promise<unknown | null> {
    const db = getSqliteClient();

    // Try visitor-scoped (protected) first if visitorId provided
    if (visitorId) {
      const row = await db.get(
        'SELECT value FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?',
        [cruxId, key, visitorId],
      );
      if (row) return parseValue(row.value as string);
    }

    // Fall back to the crux's one row (visitor_id IS NULL): public
    const row = await db.get(
      'SELECT value FROM store WHERE crux_id = ? AND key = ? AND visitor_id IS NULL',
      [cruxId, key],
    );
    return row ? parseValue(row.value as string) : null;
  }

  async set(
    cruxId: string,
    key: string,
    value: unknown,
    mode: StoreMode = 'protected',
    visitorId?: string | null,
  ): Promise<void> {
    mode = normalizeStoreMode(mode);
    const db = getSqliteClient();
    const now = new Date().toISOString();
    const serialized = JSON.stringify(value);

    // Public keys are the crux's one row (visitor_id NULL); protected is per visitor
    const vid = mode === 'protected' ? (visitorId ?? null) : null;

    if (vid) {
      // Protected key — upsert on (crux_id, visitor_id, key)
      const existing = await db.get(
        'SELECT id FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?',
        [cruxId, key, vid],
      );
      if (existing) {
        await db.run('UPDATE store SET value = ?, mode = ?, updated = ? WHERE id = ?', [
          serialized,
          mode,
          now,
          existing.id,
        ]);
      } else {
        await db.run(
          'INSERT INTO store (id, crux_id, visitor_id, key, value, mode, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), cruxId, vid, key, serialized, mode, now, now],
        );
      }
    } else {
      // Public key — upsert on (crux_id, key) WHERE visitor_id IS NULL
      const existing = await db.get(
        'SELECT id FROM store WHERE crux_id = ? AND key = ? AND visitor_id IS NULL',
        [cruxId, key],
      );
      if (existing) {
        await db.run('UPDATE store SET value = ?, mode = ?, updated = ? WHERE id = ?', [
          serialized,
          mode,
          now,
          existing.id,
        ]);
      } else {
        await db.run(
          'INSERT INTO store (id, crux_id, visitor_id, key, value, mode, created, updated) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), cruxId, key, serialized, mode, now, now],
        );
      }
    }
  }

  async increment(
    cruxId: string,
    key: string,
    by: number = 1,
    visitorId?: string | null,
  ): Promise<number> {
    const current = await this.get(cruxId, key, visitorId);
    const currentNum = typeof current === 'number' ? current : 0;
    const newValue = currentNum + by;

    // Determine mode from existing entry or default to public (counters are typically public)
    const db = getSqliteClient();
    let mode: StoreMode = 'public';
    const existing = visitorId
      ? await db.get('SELECT mode FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?', [
          cruxId,
          key,
          visitorId,
        ])
      : await db.get(
          'SELECT mode FROM store WHERE crux_id = ? AND key = ? AND visitor_id IS NULL',
          [cruxId, key],
        );
    if (existing) mode = normalizeStoreMode(existing.mode as string);

    await this.set(cruxId, key, newValue, mode, visitorId);
    return newValue;
  }

  async delete(cruxId: string, key: string, visitorId?: string | null): Promise<void> {
    const db = getSqliteClient();
    if (visitorId) {
      await db.run('DELETE FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?', [
        cruxId,
        key,
        visitorId,
      ]);
    } else {
      await db.run('DELETE FROM store WHERE crux_id = ? AND key = ? AND visitor_id IS NULL', [
        cruxId,
        key,
      ]);
    }
  }

  async list(cruxId: string): Promise<StoreEntry[]> {
    const db = getSqliteClient();
    const rows = await db.all('SELECT * FROM store WHERE crux_id = ? ORDER BY key', [cruxId]);
    return rows.map(toStoreEntry);
  }

  async clear(cruxId: string): Promise<void> {
    const db = getSqliteClient();
    await db.run('DELETE FROM store WHERE crux_id = ?', [cruxId]);
  }
}
