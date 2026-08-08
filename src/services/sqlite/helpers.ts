import type { Artifact } from '../types';

// ── Case conversion ──────────────────────────────────

/** Convert camelCase key to snake_case */
function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Convert snake_case key to camelCase */
function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/** Convert a camelCase object to snake_case keys (shallow) */
export function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    row[toSnake(k)] = v;
  }
  return row;
}

/** Convert a snake_case row to camelCase keys (shallow), parsing JSON meta */
export function fromRow<T>(row: Record<string, unknown>): T {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = toCamel(k);
    if (key === 'meta' && typeof v === 'string') {
      try {
        obj[key] = JSON.parse(v || '{}');
      } catch {
        obj[key] = {};
      }
    } else if (key === 'discoverable' || key === 'system') {
      obj[key] = !!v;
    } else {
      obj[key] = v;
    }
  }
  return obj as T;
}

// ── Artifact helpers ───────────────────────────────

/** Convert artifact row to Artifact (strips internal content/path columns, keeps fingerprint) */
export function toArtifact(row: Record<string, unknown>): Artifact {
  const entity = fromRow<Record<string, unknown>>(row);
  delete entity.content;
  delete entity.path;
  return entity as unknown as Artifact;
}

// ── Slug generation ──────────────────────────────────

export function generateSlug(title?: string): string {
  if (!title) return crypto.randomUUID().slice(0, 8);
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || crypto.randomUUID().slice(0, 8)
  );
}

// ── MIME type detection ──────────────────────────────

// Single MIME table lives in lib/mime; re-exported for existing importers.
export { guessMimeType } from '@/lib/mime';

// ── Content hashing ──────────────────────────────────

export async function hashContent(content: string | Blob | Uint8Array): Promise<string> {
  let buffer: ArrayBuffer;
  if (typeof content === 'string') {
    buffer = new TextEncoder().encode(content).buffer as ArrayBuffer;
  } else if (content instanceof Blob) {
    buffer = await content.arrayBuffer();
  } else {
    buffer = content.buffer as ArrayBuffer;
  }
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ── SQL helpers ──────────────────────────────────────

/** Build INSERT statement from an object */
export function buildInsert(
  table: string,
  data: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  const keys = Object.keys(data);
  const cols = keys.map(toSnake).join(', ');
  const placeholders = keys.map(() => '?').join(', ');
  const params = keys.map((k) => {
    const v = data[k];
    if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) {
      return JSON.stringify(v);
    }
    return v ?? null;
  });
  return { sql: `INSERT INTO ${table} (${cols}) VALUES (${placeholders})`, params };
}

/** Build UPDATE SET clause from an object */
export function buildUpdate(
  table: string,
  id: string,
  data: Record<string, unknown>,
): { sql: string; params: unknown[] } {
  const keys = Object.keys(data);
  const sets = keys.map((k) => `${toSnake(k)} = ?`).join(', ');
  const params = keys.map((k) => {
    const v = data[k];
    if (v !== null && typeof v === 'object' && !(v instanceof Uint8Array)) {
      return JSON.stringify(v);
    }
    return v ?? null;
  });
  params.push(id);
  return { sql: `UPDATE ${table} SET ${sets} WHERE id = ?`, params };
}
