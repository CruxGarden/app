const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Use the same schema as the web app's WASM SQLite
function loadSchema(): string {
  // Try relative to dist/ (compiled), then relative to src/ (dev)
  const candidates = [
    path.join(__dirname, '../../src/services/sqlite/schema.sql'),
    path.join(__dirname, '../../../src/services/sqlite/schema.sql'),
  ];
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
export class SqliteNative {
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
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }

  import(data: ArrayBuffer): void {
    const dbPath = this.db.name;
    this.db.close();
    fs.writeFileSync(dbPath, Buffer.from(data));
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }

  close(): void {
    this.db.close();
  }

  // ── Blob storage (filesystem) ──────────────────────────────

  private blobPath(fingerprint: string): string {
    return path.join(this.blobDir, fingerprint);
  }

  blobWrite(fingerprint: string, data: Uint8Array): void {
    fs.writeFileSync(this.blobPath(fingerprint), Buffer.from(data));
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
