import type { ISqliteClient } from './client';

/**
 * Electron IPC-based SQLite client.
 * Talks to the main process via window.electronAPI.sqlite.
 * Implements ISqliteClient so the rest of the app is backend-agnostic.
 */

interface ElectronSqliteAPI {
  run: (sql: string, params?: unknown[]) => Promise<{ changes: number }>;
  get: (sql: string, params?: unknown[]) => Promise<unknown>;
  all: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  export: () => Promise<ArrayBuffer>;
  import: (data: ArrayBuffer) => Promise<void>;
  close: () => Promise<void>;
  blobWrite: (fingerprint: string, data: Uint8Array) => Promise<void>;
  blobRead: (fingerprint: string) => Promise<Uint8Array>;
  blobDelete: (fingerprint: string) => Promise<void>;
  blobExists: (fingerprint: string) => Promise<boolean>;
  blobWipeAll: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: {
      sqlite: ElectronSqliteAPI;
    };
  }
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI?.sqlite;
}

export class ElectronSqliteClient implements ISqliteClient {
  private get api(): ElectronSqliteAPI {
    if (!window.electronAPI?.sqlite) {
      throw new Error('Electron SQLite API not available');
    }
    return window.electronAPI.sqlite;
  }

  async init(): Promise<void> {
    // No-op — the main process initializes the database on startup
  }

  async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
    return this.api.run(sql, params);
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    return this.api.get(sql, params) as Promise<T | undefined>;
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.api.all(sql, params) as Promise<T[]>;
  }

  async export(): Promise<ArrayBuffer> {
    return this.api.export();
  }

  async import(data: ArrayBuffer): Promise<void> {
    return this.api.import(data);
  }

  async close(): Promise<void> {
    return this.api.close();
  }

  async blobWrite(fingerprint: string, data: Uint8Array): Promise<void> {
    return this.api.blobWrite(fingerprint, data);
  }

  async blobRead(fingerprint: string): Promise<Uint8Array> {
    return this.api.blobRead(fingerprint);
  }

  async blobDelete(fingerprint: string): Promise<void> {
    return this.api.blobDelete(fingerprint);
  }

  async blobExists(fingerprint: string): Promise<boolean> {
    return this.api.blobExists(fingerprint);
  }

  async blobWipeAll(): Promise<void> {
    return this.api.blobWipeAll();
  }
}
