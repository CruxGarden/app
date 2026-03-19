/// <reference lib="webworker" />
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
// @ts-expect-error — wa-sqlite examples aren't typed
import { AccessHandlePoolVFS } from 'wa-sqlite/src/examples/AccessHandlePoolVFS.js';

import { MemoryAsyncVFS } from 'wa-sqlite/src/examples/MemoryAsyncVFS.js';
import SCHEMA from './schema.sql?raw';

export type WorkerRequest =
  | { id: string; method: 'init' }
  | { id: string; method: 'run'; sql: string; params?: unknown[] }
  | { id: string; method: 'get'; sql: string; params?: unknown[] }
  | { id: string; method: 'all'; sql: string; params?: unknown[] }
  | { id: string; method: 'export' }
  | { id: string; method: 'import'; data: ArrayBuffer }
  | { id: string; method: 'close' }
  | { id: string; method: 'blob-write'; fingerprint: string; data: Uint8Array }
  | { id: string; method: 'blob-read'; fingerprint: string }
  | { id: string; method: 'blob-delete'; fingerprint: string }
  | { id: string; method: 'blob-exists'; fingerprint: string }
  | { id: string; method: 'blob-wipe-all' };

export type WorkerResponse = {
  id: string;
  result?: unknown;
  error?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sqlite3: any;
let dbHandle: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let memoryVfs: any;

// ── OPFS blob storage ──────────────────────────────────

let blobsDir: FileSystemDirectoryHandle | null = null;

async function initBlobs(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  blobsDir = await root.getDirectoryHandle('crux-blobs', { create: true });
}

async function blobWrite(fingerprint: string, data: Uint8Array): Promise<void> {
  if (!blobsDir) throw new Error('Blob storage not initialized');
  const fileHandle = await blobsDir.getFileHandle(fingerprint, { create: true });
  const handle = await fileHandle.createSyncAccessHandle();
  try {
    handle.truncate(0);
    handle.write(data);
    handle.flush();
  } finally {
    handle.close();
  }
}

async function blobRead(fingerprint: string): Promise<Uint8Array> {
  if (!blobsDir) throw new Error('Blob storage not initialized');
  const fileHandle = await blobsDir.getFileHandle(fingerprint);
  const handle = await fileHandle.createSyncAccessHandle();
  try {
    const size = handle.getSize();
    const buffer = new Uint8Array(size);
    handle.read(buffer);
    return buffer;
  } finally {
    handle.close();
  }
}

async function blobDelete(fingerprint: string): Promise<void> {
  if (!blobsDir) throw new Error('Blob storage not initialized');
  try {
    await blobsDir.removeEntry(fingerprint);
  } catch {
    // File doesn't exist — that's fine
  }
}

async function blobExists(fingerprint: string): Promise<boolean> {
  if (!blobsDir) throw new Error('Blob storage not initialized');
  try {
    await blobsDir.getFileHandle(fingerprint);
    return true;
  } catch {
    return false;
  }
}

async function blobWipeAll(): Promise<void> {
  if (!blobsDir) throw new Error('Blob storage not initialized');
  const entries: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OPFS keys() not in all TS lib defs
  for await (const name of (blobsDir as any).keys()) {
    entries.push(name);
  }
  for (const name of entries) {
    await blobsDir.removeEntry(name);
  }
}

// ── SQLite core ────────────────────────────────────────

const MAX_INIT_RETRIES = 4;
const INIT_DELAYS = [100, 300, 800, 1500]; // ms — escalating backoff

async function init() {
  // Load WASM module once (this part never fails on retry)
  const module = await SQLiteESMFactory();
  sqlite3 = SQLite.Factory(module);

  // Register MemoryAsyncVFS (in-memory, no contention issues)
  memoryVfs = new MemoryAsyncVFS();
  memoryVfs.name = 'crux-mem';
  sqlite3.vfs_register(memoryVfs, false);

  // OPFS VFS — may fail if the browser hasn't released handles from a previous page load
  for (let attempt = 0; attempt < MAX_INIT_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, INIT_DELAYS[attempt]!));
      }
      const vfs = new AccessHandlePoolVFS('/cruxgarden');
      await vfs.isReady;
      sqlite3.vfs_register(vfs, true);

      const flags = SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_URI;
      dbHandle = await sqlite3.open_v2('cruxgarden.db', flags);

      await exec('PRAGMA journal_mode=WAL');
      await exec(SCHEMA);

      // Initialize OPFS blob storage + run migrations
      await migrate();
      return;
    } catch (err) {
      if (attempt === MAX_INIT_RETRIES - 1) {
        // All retries failed — fall back to in-memory database
        // This happens when another tab holds the OPFS lock
        // Silently fall back — this is expected when another tab holds the OPFS lock
        const vfs = new MemoryAsyncVFS();
        sqlite3.vfs_register(vfs, true);
        const flags = SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE | SQLite.SQLITE_OPEN_URI;
        dbHandle = await sqlite3.open_v2('cruxgarden.db', flags);
        await exec('PRAGMA journal_mode=WAL');
        await exec(SCHEMA);
        return;
      }
      // Silent retry — OPFS handle contention on refresh is expected
    }
  }
}

// ── Migration ──────────────────────────────────────────

async function hashBytes(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function migrate(): Promise<void> {
  const versionRow = await get('SELECT version FROM schema_version');
  const currentVersion = versionRow ? (versionRow.version as number) : 0;

  if (currentVersion < 2) {
    await initBlobs();

    // Check if content column exists (old databases created with schema v1)
    const tableInfo = await all("PRAGMA table_info('artifacts')");
    const hasContentColumn = tableInfo.some((col) => col.name === 'content');

    if (hasContentColumn) {
      // Migrate all content from SQLite to OPFS blobs
      const rows = await all(
        'SELECT id, fingerprint, content, encoding FROM artifacts WHERE content IS NOT NULL',
      );

      for (const row of rows) {
        const content = row.content;
        if (content === null || content === undefined) continue;

        let data: Uint8Array;
        if (content instanceof Uint8Array) {
          data = content;
        } else if (typeof content === 'string') {
          data = new TextEncoder().encode(content);
        } else {
          continue;
        }

        // Compute fingerprint if missing
        let fp = row.fingerprint as string | null;
        if (!fp) {
          fp = await hashBytes(data);
          await run('UPDATE artifacts SET fingerprint = ? WHERE id = ?', [fp, row.id]);
        }

        // Write to OPFS (idempotent — same fingerprint overwrites)
        await blobWrite(fp, data);
      }

      // Drop the content column — data now lives in OPFS
      await exec('ALTER TABLE artifacts DROP COLUMN content');
    }

    // Set schema version to 2
    if (currentVersion === 0) {
      await run('INSERT INTO schema_version (version) VALUES (2)');
    } else {
      await run('UPDATE schema_version SET version = 2 WHERE version = 1');
    }
  } else {
    // Schema is current — just make sure blob storage is ready
    await initBlobs();
  }

  // v2 → v3: store table (created by schema.sql for new databases,
  // but existing databases need the table added explicitly)
  const v3Row = await get('SELECT version FROM schema_version');
  const v3Version = v3Row ? (v3Row.version as number) : 0;
  if (v3Version < 3) {
    await exec(`
      CREATE TABLE IF NOT EXISTS store (
        id TEXT PRIMARY KEY,
        crux_id TEXT NOT NULL,
        visitor_id TEXT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'protected',
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      )
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_store_public ON store (crux_id, key) WHERE visitor_id IS NULL`);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_store_protected ON store (crux_id, visitor_id, key) WHERE visitor_id IS NOT NULL`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_store_crux ON store(crux_id)`);
    await run('UPDATE schema_version SET version = 3');
  }
}

// ── SQL execution helpers ──────────────────────────────

async function exec(sql: string): Promise<void> {
  for await (const stmt of sqlite3.statements(dbHandle, sql)) {
    await sqlite3.step(stmt);
  }
}

function bindParams(stmt: number, params: unknown[]) {
  for (let i = 0; i < params.length; i++) {
    const val = params[i];
    if (val === null || val === undefined) {
      sqlite3.bind(stmt, i + 1, null);
    } else if (val instanceof Uint8Array) {
      sqlite3.bind(stmt, i + 1, val);
    } else if (val instanceof ArrayBuffer) {
      sqlite3.bind(stmt, i + 1, new Uint8Array(val));
    } else if (typeof val === 'number' || typeof val === 'string' || typeof val === 'bigint') {
      sqlite3.bind(stmt, i + 1, val);
    } else {
      // Objects/arrays → JSON string
      sqlite3.bind(stmt, i + 1, JSON.stringify(val));
    }
  }
}

function getColumnNames(stmt: number): string[] {
  const count = sqlite3.column_count(stmt);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(sqlite3.column_name(stmt, i));
  }
  return names;
}

function getRow(stmt: number, columns: string[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    const val = sqlite3.column(stmt, i);
    // wa-sqlite returns BLOB data as a Uint8Array view into WASM linear memory.
    // This view is invalidated when the statement is stepped/finalized, so copy it.
    row[col] = val instanceof Uint8Array ? val.slice() : val;
  }
  return row;
}

async function run(sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  for await (const stmt of sqlite3.statements(dbHandle, sql)) {
    if (params.length) bindParams(stmt, params);
    await sqlite3.step(stmt);
  }
  return { changes: sqlite3.changes(dbHandle) };
}

async function get(sql: string, params: unknown[] = []): Promise<Record<string, unknown> | undefined> {
  for await (const stmt of sqlite3.statements(dbHandle, sql)) {
    if (params.length) bindParams(stmt, params);
    if ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      const columns = getColumnNames(stmt);
      return getRow(stmt, columns);
    }
  }
  return undefined;
}

async function all(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for await (const stmt of sqlite3.statements(dbHandle, sql)) {
    if (params.length) bindParams(stmt, params);
    const columns = getColumnNames(stmt);
    while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
      rows.push(getRow(stmt, columns));
    }
  }
  return rows;
}

// ── Database export/import ─────────────────────────────

const EXPORT_URI = `file:export.db?vfs=crux-mem`;

// The actual key the VFS stores the file under (captured during export)
let resolvedExportName: string | null = null;

async function exportDb(): Promise<ArrayBuffer> {
  // Clear any previous files from the memory VFS
  memoryVfs.mapNameToFile.clear();

  // VACUUM INTO copies the entire database (including blobs) into the memory VFS
  await exec(`VACUUM INTO '${EXPORT_URI}'`);

  // Find the main database file (the largest one; journal/wal files may also be created)
  let dbFile: { data: ArrayBuffer; size: number } | null = null;
  for (const [name, file] of memoryVfs.mapNameToFile.entries()) {
    if (!dbFile || file.size > dbFile.size) {
      dbFile = file;
      resolvedExportName = name; // capture the actual VFS key
    }
  }
  if (!dbFile || dbFile.size === 0) throw new Error('Export failed — no output file');

  // Copy the exact bytes (file.data may be over-allocated)
  const result = new ArrayBuffer(dbFile.size);
  new Uint8Array(result).set(new Uint8Array(dbFile.data, 0, dbFile.size));

  // Clean up
  memoryVfs.mapNameToFile.clear();
  return result;
}

async function importDb(data: ArrayBuffer): Promise<void> {
  // We need to know the VFS key SQLite uses. If we've exported before, use that.
  // Otherwise, do a dummy export to discover the resolved name.
  if (!resolvedExportName) {
    memoryVfs.mapNameToFile.clear();
    await exec(`VACUUM INTO '${EXPORT_URI}'`);
    for (const [name, file] of memoryVfs.mapNameToFile.entries()) {
      if (!resolvedExportName || file.size > 0) {
        resolvedExportName = name;
      }
    }
    memoryVfs.mapNameToFile.clear();
  }
  if (!resolvedExportName) throw new Error('Import failed — could not resolve VFS filename');

  // Place the imported file into the memory VFS under the resolved name
  memoryVfs.mapNameToFile.set(resolvedExportName, {
    name: resolvedExportName,
    flags: 0,
    size: data.byteLength,
    data: data,
  });

  // Attach the imported database and copy data inside a transaction
  // so a failure mid-import doesn't leave the database partially deleted.
  await exec(`ATTACH '${EXPORT_URI}' AS import_db`);

  const tables = ['cruxes', 'artifacts', 'dimensions', 'authors', 'settings', 'store'];
  try {
    await exec('BEGIN TRANSACTION');
    for (const table of tables) {
      await run(`DELETE FROM ${table}`);
    }
    for (const table of tables) {
      await run(`INSERT OR REPLACE INTO main.${table} SELECT * FROM import_db.${table}`);
    }
    await exec('COMMIT');
  } catch (err) {
    await exec('ROLLBACK');
    await exec('DETACH import_db');
    throw err;
  }

  await exec('DETACH import_db');

  // Clean up
  memoryVfs.mapNameToFile.clear();
}

// ── Message handler ────────────────────────────────────

// Lazy init — deferred until the first message arrives, giving the browser
// time to release OPFS file handles from a previous page load.
let ready: Promise<void> | null = null;

// Serialize all message processing to prevent concurrent OPFS access.
// Without this, two async handlers (e.g., from React StrictMode double-invoke)
// can race on createSyncAccessHandle for the same fingerprint.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  queue = queue.then(() => handleMessage(e));
};

async function handleMessage(e: MessageEvent<WorkerRequest>) {
  if (!ready) ready = init();
  await ready;
  const msg = e.data;
  try {
    let result: unknown;
    switch (msg.method) {
      case 'init':
        result = undefined;
        break;
      case 'run':
        result = await run(msg.sql, msg.params);
        break;
      case 'get':
        result = await get(msg.sql, msg.params);
        break;
      case 'all':
        result = await all(msg.sql, msg.params);
        break;
      case 'export':
        result = await exportDb();
        (self as unknown as Worker).postMessage(
          { id: msg.id, result } as WorkerResponse,
          [result as ArrayBuffer],
        );
        return; // already posted with transfer
      case 'import':
        await importDb(msg.data);
        result = undefined;
        break;
      case 'close':
        await sqlite3.close(dbHandle);
        result = undefined;
        break;
      case 'blob-write':
        await blobWrite(msg.fingerprint, msg.data instanceof Uint8Array ? msg.data : new Uint8Array(msg.data));
        result = undefined;
        break;
      case 'blob-read': {
        const data = await blobRead(msg.fingerprint);
        result = data;
        (self as unknown as Worker).postMessage(
          { id: msg.id, result } as WorkerResponse,
          [data.buffer as ArrayBuffer],
        );
        return; // already posted with transfer
      }
      case 'blob-delete':
        await blobDelete(msg.fingerprint);
        result = undefined;
        break;
      case 'blob-exists':
        result = await blobExists(msg.fingerprint);
        break;
      case 'blob-wipe-all':
        await blobWipeAll();
        result = undefined;
        break;
    }
    (self as unknown as Worker).postMessage({ id: msg.id, result } as WorkerResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    (self as unknown as Worker).postMessage({ id: msg.id, error: message } as WorkerResponse);
  }
}
