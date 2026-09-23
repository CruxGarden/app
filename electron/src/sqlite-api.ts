import { LocalGraphRuntime, inspectDesktopRecovery } from '@cruxgarden/local-api';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NativeBlobStore } from './native-blobs';
import type { NativeStorage } from './native-storage';

/** Desktop bridge to the actual API owner. No second SQL connection or fallback. */
export class SqliteApi implements NativeStorage {
  private closed = false;
  private replacing = false;
  private unavailable: Error | null = null;

  private constructor(
    private readonly owner: LocalGraphRuntime,
    private readonly blobs: NativeBlobStore,
  ) {}

  static async open(filename: string, blobDir: string): Promise<SqliteApi> {
    mkdirSync(dirname(filename), { recursive: true });
    const owner = await (existsSync(filename)
      ? LocalGraphRuntime.open(filename)
      : LocalGraphRuntime.create(filename));
    try {
      return new SqliteApi(owner, new NativeBlobStore(blobDir));
    } catch (error) {
      await owner.close();
      throw error;
    }
  }

  run(sql: string, params?: unknown[]) {
    return this.owner.run(sql, params);
  }
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    return this.owner.get<T>(sql, params);
  }
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    return this.owner.all<T>(sql, params);
  }
  export() {
    return this.owner.exportDatabase();
  }
  inspectImport(data: ArrayBuffer): string[] {
    this.assertAvailable();
    return inspectDesktopRecovery(data).fingerprints;
  }
  async import(data: ArrayBuffer): Promise<void> {
    this.assertAvailable();
    this.replacing = true;
    try {
      // Garden IO stages verified blobs and holds the installation recovery image.
      await this.owner.replaceDatabase(data);
    } catch (error) {
      // A handled failure reopens the previous database. If the owner instead
      // requires recovery, content must remain protected with its metadata.
      try {
        await this.owner.get('SELECT 1');
      } catch (failure) {
        this.unavailable = failure instanceof Error ? failure : new Error(String(failure));
      }
      throw error;
    } finally {
      this.replacing = false;
    }
  }
  close(): Promise<void> {
    this.closed = true;
    return this.owner.close();
  }

  private assertAvailable(): void {
    if (this.unavailable) throw this.unavailable;
    if (this.closed) throw new Error('Local API storage is closing');
    if (this.replacing) throw new Error('Local API storage is replacing its database');
  }
  blobWrite(fingerprint: string, data: Uint8Array): void {
    this.assertAvailable();
    this.blobs.blobWrite(fingerprint, data);
  }
  blobRead(fingerprint: string): Uint8Array {
    this.assertAvailable();
    return this.blobs.blobRead(fingerprint);
  }
  blobDelete(fingerprint: string): void {
    this.assertAvailable();
    this.blobs.blobDelete(fingerprint);
  }
  blobExists(fingerprint: string): boolean {
    this.assertAvailable();
    return this.blobs.blobExists(fingerprint);
  }
  blobWipeAll(): void {
    this.assertAvailable();
    this.blobs.blobWipeAll();
  }
}
