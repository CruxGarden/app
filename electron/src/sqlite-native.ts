import { inspectDesktopRecovery } from '@cruxgarden/local-api';
import type { NativeStorage } from './native-storage';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// Use the same schema as the web app's WASM SQLite
function loadSchema(): string {
  const candidates = [
    // Dev: relative to electron/dist/
    path.join(__dirname, '../../src/services/sqlite/schema.sql'),
    path.join(__dirname, '../../../src/services/sqlite/schema.sql'),
  ];
  // Packaged: in extraResources
  try {
    const { app } = require('electron');
    if (app.isPackaged) {
      candidates.unshift(path.join(process.resourcesPath, 'schema.sql'));
    }
  } catch {}
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  }
  throw new Error('schema.sql not found — checked: ' + candidates.join(', '));
}

/**
 * Native SQLite backend using better-sqlite3.
 * Runs in Electron's main process. Matches the ISqliteClient interface
 * from the web app so the renderer can swap seamlessly.
 */
export class SqliteNative implements NativeStorage {
  private db: any;
  private blobDir: string;

  constructor(dbPath: string, blobDir: string) {
    // Ensure directories exist
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(blobDir, { recursive: true });

    this.db = new Database(dbPath);
    this.blobDir = blobDir;

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');

    // Run schema
    this.db.exec(loadSchema());
    this.ensureColumns();
  }

  /**
   * Columns added after a table was first created. `CREATE TABLE IF NOT EXISTS`
   * leaves an existing table alone, so each addition is checked here, once, on
   * open — the desktop counterpart of the worker's schema_version migrations.
   */
  private ensureColumns(db = this.db): void {
    const cols = db.pragma("table_info('cruxes')") as { name: string }[];
    if (!cols.some((c) => c.name === 'deleted'))
      db.exec('ALTER TABLE cruxes ADD COLUMN deleted TEXT');
  }

  /** Sanitize params for better-sqlite3 which only accepts number, string, bigint, Buffer, null */
  private sanitize(params?: unknown[]): unknown[] | undefined {
    if (!params) return undefined;
    return params.map((p) => {
      if (p === undefined) return null;
      if (p === true) return 1;
      if (p === false) return 0;
      if (typeof p === 'object' && p !== null && !Buffer.isBuffer(p)) return JSON.stringify(p);
      return p;
    });
  }

  run(sql: string, params?: unknown[]): { changes: number } {
    const stmt = this.db.prepare(sql);
    const safe = this.sanitize(params);
    const result = safe ? stmt.run(...safe) : stmt.run();
    return { changes: result.changes };
  }

  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined {
    const stmt = this.db.prepare(sql);
    const safe = this.sanitize(params);
    return (safe ? stmt.get(...safe) : stmt.get()) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    const safe = this.sanitize(params);
    return (safe ? stmt.all(...safe) : stmt.all()) as T[];
  }

  export(): ArrayBuffer {
    const buffer = this.db.serialize();
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  }

  inspectImport(data: ArrayBuffer): string[] {
    return inspectDesktopRecovery(data).fingerprints;
  }

  import(data: ArrayBuffer): void {
    // Validate through the actual API before closing the current owner. Normalize
    // legacy optional tables/columns in detached bytes, never in the live file.
    // Content availability belongs to the restore coordinator: this primitive
    // also restores a safety image whose pre-existing content may be incomplete.
    const inspected = inspectDesktopRecovery(data);
    const candidate = new Database(Buffer.from(inspected.database));
    let prepared: Buffer;
    try {
      candidate.exec(loadSchema());
      this.ensureColumns(candidate);
      prepared = candidate.serialize();
    } finally {
      candidate.close();
    }
    const dbPath = this.db.name;
    const staging = path.join(
      path.dirname(dbPath),
      `.${path.basename(dbPath)}.${randomUUID()}.restore`,
    );
    try {
      // A short write must only damage an uncommitted file. Keep the current
      // connection usable until the entire prepared image is flushed to disk.
      fs.writeFileSync(staging, prepared, { flag: 'wx', mode: 0o600, flush: true });
      if (this.db.open) this.db.close();
      fs.renameSync(staging, dbPath);
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
    } catch (error) {
      // Failed rename leaves the previous file intact, but its connection was
      // closed to release WAL files. Reopen it so normal work and retries work.
      try {
        if (!this.db.open) {
          this.db = new Database(dbPath);
          this.db.pragma('journal_mode = WAL');
        }
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'Database replacement failed and storage could not be reopened.',
          { cause: recoveryError },
        );
      }
      throw error;
    } finally {
      try {
        fs.rmSync(staging, { force: true });
      } catch {
        /* Retain an orphan temporary image rather than masking the failure. */
      }
    }
  }

  close(): void {
    this.db.close();
  }

  // ── Blob storage (filesystem) ──────────────────────────────

  private blobPath(fingerprint: string): string {
    // Blob names are content fingerprints — SHA-256 hex, nothing else. Without
    // this check the renderer could pass '../…' and turn every blob operation
    // into arbitrary filesystem read/write/delete.
    if (!/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new Error(`invalid blob fingerprint: ${String(fingerprint).slice(0, 32)}`);
    }
    return path.join(this.blobDir, fingerprint);
  }

  blobWrite(fingerprint: string, data: Uint8Array): void {
    const destination = this.blobPath(fingerprint);
    const staging = path.join(this.blobDir, `.${fingerprint}.${randomUUID()}.tmp`);
    try {
      // Never truncate a committed blob: snapshots and other Cruxes may share
      // it. Flush a complete sibling file before the atomic rename commits it.
      fs.writeFileSync(staging, Buffer.from(data), { flag: 'wx', mode: 0o600, flush: true });
      fs.renameSync(staging, destination);
    } finally {
      try {
        fs.rmSync(staging, { force: true });
      } catch {
        // An unreferenced temporary file is safer than masking a write failure.
      }
    }
  }

  blobRead(fingerprint: string): Uint8Array {
    const p = this.blobPath(fingerprint);
    if (!fs.existsSync(p)) throw new Error(`Blob not found: ${fingerprint}`);
    return new Uint8Array(fs.readFileSync(p));
  }

  blobDelete(fingerprint: string): void {
    const p = this.blobPath(fingerprint);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  blobExists(fingerprint: string): boolean {
    return fs.existsSync(this.blobPath(fingerprint));
  }

  blobWipeAll(): void {
    const files = fs.readdirSync(this.blobDir);
    for (const file of files) {
      fs.unlinkSync(path.join(this.blobDir, file));
    }
  }
}
