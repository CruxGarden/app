import { getSqliteClient } from './client';
import { fromRow } from './helpers';

// ── Types ────────────────────────────────────────────

export interface StoreEntry {
  id: string;
  cruxId: string;
  visitorId: string | null;
  key: string;
  value: unknown;
  mode: 'public' | 'protected';
  created: string;
  updated: string;
}

export interface IStoreService {
  get(cruxId: string, key: string, visitorId?: string | null): Promise<unknown | null>;
  set(cruxId: string, key: string, value: unknown, mode?: 'public' | 'protected', visitorId?: string | null): Promise<void>;
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

    // Fall back to public (visitor_id IS NULL)
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
    mode: 'public' | 'protected' = 'protected',
    visitorId?: string | null,
  ): Promise<void> {
    const db = getSqliteClient();
    const now = new Date().toISOString();
    const serialized = JSON.stringify(value);

    // For public keys, visitor_id is always NULL
    const vid = mode === 'public' ? null : (visitorId ?? null);

    if (vid) {
      // Protected key — upsert on (crux_id, visitor_id, key)
      const existing = await db.get(
        'SELECT id FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?',
        [cruxId, key, vid],
      );
      if (existing) {
        await db.run(
          'UPDATE store SET value = ?, mode = ?, updated = ? WHERE id = ?',
          [serialized, mode, now, existing.id],
        );
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
        await db.run(
          'UPDATE store SET value = ?, mode = ?, updated = ? WHERE id = ?',
          [serialized, mode, now, existing.id],
        );
      } else {
        await db.run(
          'INSERT INTO store (id, crux_id, visitor_id, key, value, mode, created, updated) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), cruxId, key, serialized, mode, now, now],
        );
      }
    }
  }

  async increment(cruxId: string, key: string, by: number = 1, visitorId?: string | null): Promise<number> {
    const current = await this.get(cruxId, key, visitorId);
    const currentNum = typeof current === 'number' ? current : 0;
    const newValue = currentNum + by;

    // Determine mode from existing entry or default to public (counters are typically public)
    const db = getSqliteClient();
    let mode: 'public' | 'protected' = 'public';
    const existing = visitorId
      ? await db.get('SELECT mode FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?', [cruxId, key, visitorId])
      : await db.get('SELECT mode FROM store WHERE crux_id = ? AND key = ? AND visitor_id IS NULL', [cruxId, key]);
    if (existing) mode = existing.mode as 'public' | 'protected';

    await this.set(cruxId, key, newValue, mode, visitorId);
    return newValue;
  }

  async delete(cruxId: string, key: string, visitorId?: string | null): Promise<void> {
    const db = getSqliteClient();
    if (visitorId) {
      await db.run(
        'DELETE FROM store WHERE crux_id = ? AND key = ? AND visitor_id = ?',
        [cruxId, key, visitorId],
      );
    } else {
      await db.run(
        'DELETE FROM store WHERE crux_id = ? AND key = ? AND visitor_id IS NULL',
        [cruxId, key],
      );
    }
  }

  async list(cruxId: string): Promise<StoreEntry[]> {
    const db = getSqliteClient();
    const rows = await db.all(
      'SELECT * FROM store WHERE crux_id = ? ORDER BY key',
      [cruxId],
    );
    return rows.map(toStoreEntry);
  }

  async clear(cruxId: string): Promise<void> {
    const db = getSqliteClient();
    await db.run('DELETE FROM store WHERE crux_id = ?', [cruxId]);
  }
}
