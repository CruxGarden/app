import type { Attachment } from '../types';

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
      try { obj[key] = JSON.parse(v || '{}'); } catch { obj[key] = {}; }
    } else {
      obj[key] = v;
    }
  }
  return obj as T;
}

// ── Attachment helpers ───────────────────────────────

/** Convert artifact row to Attachment (strips internal content/path columns, keeps fingerprint) */
export function toAttachment(row: Record<string, unknown>): Attachment {
  const entity = fromRow<Record<string, unknown>>(row);
  delete entity.content;
  delete entity.path;
  return entity as unknown as Attachment;
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

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.csv': 'text/csv',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.sh': 'text/x-sh',
  '.toml': 'text/x-toml',
};

export function guessMimeType(path: string): string {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

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
