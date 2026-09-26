import type { ISqliteClient } from './client';
import type { SqliteBridge } from '@/lib/platform';

/**
 * Electron IPC-based SQLite client.
 * Talks to the main process via window.electronAPI.sqlite (contract in
 * electron/src/bridge.ts). Implements ISqliteClient so the rest of the app
 * is backend-agnostic.
 */


/** A read: SELECT or WITH, naming no statement that changes anything. */
export function assertRead(sql: string): void {
  const statement = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '');
  if (
    !/^(SELECT|WITH)\b/i.test(statement) ||
    /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX)\b/i.test(
      statement,
    )
  )
    throw new Error('Only reads are open here; changes go through named commands.');
}

export class ElectronSqliteClient implements ISqliteClient {
  private get api(): SqliteBridge {
    if (!window.electronAPI?.sqlite) {
      throw new Error('Electron SQLite API not available');
    }
    return window.electronAPI.sqlite;
  }

  async init(): Promise<void> {
    // No-op — the main process initializes the database on startup
  }

  /** On desktop every change is a named command of the API owner; raw SQL only reads. */
  async run(sql: string): Promise<{ changes: number }> {
    throw new Error(
      `Raw SQL writes are closed on desktop; use a named command. (${sql.slice(0, 40)}…)`,
    );
  }

  async get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined> {
    assertRead(sql);
    return this.api.get(sql, params) as Promise<T | undefined>;
  }

  async all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    assertRead(sql);
    return this.api.all(sql, params) as Promise<T[]>;
  }

  get enterLocalGarden(): SqliteBridge['enterLocalGarden'] {
    return this.api.enterLocalGarden;
  }

  get gardenMood(): SqliteBridge['gardenMood'] {
    return this.api.gardenMood;
  }

  get installation(): SqliteBridge['installation'] {
    return this.api.installation;
  }
  get settings(): SqliteBridge['settings'] {
    return this.api.settings;
  }
  get gardenMembership(): SqliteBridge['gardenMembership'] {
    return this.api.gardenMembership;
  }

  get privateArchive(): SqliteBridge['privateArchive'] {
    return this.api.privateArchive;
  }

  get fileContent(): SqliteBridge['fileContent'] {
    return this.api.fileContent;
  }

  get onChange(): SqliteBridge['onChange'] {
    return this.api.onChange;
  }

  get mergeCruxMeta(): SqliteBridge['mergeCruxMeta'] {
    return this.api.mergeCruxMeta;
  }

  get createCrux(): SqliteBridge['createCrux'] {
    return this.api.createCrux;
  }
  get prepareWorkingCopyFolder(): SqliteBridge['prepareWorkingCopyFolder'] {
    return this.api.prepareWorkingCopyFolder;
  }
  get finishWorkingCopySetup(): SqliteBridge['finishWorkingCopySetup'] {
    return this.api.finishWorkingCopySetup;
  }
  get workingCopyBase(): SqliteBridge['workingCopyBase'] {
    return this.api.workingCopyBase;
  }
  get createWorkingCopy(): SqliteBridge['createWorkingCopy'] {
    return this.api.createWorkingCopy;
  }
  get saveTaskReview(): SqliteBridge['saveTaskReview'] {
    return this.api.saveTaskReview;
  }
  get beginTaskMerge(): SqliteBridge['beginTaskMerge'] {
    return this.api.beginTaskMerge;
  }
  get releaseTaskReview(): SqliteBridge['releaseTaskReview'] {
    return this.api.releaseTaskReview;
  }
  get completeTaskMerge(): SqliteBridge['completeTaskMerge'] {
    return this.api.completeTaskMerge;
  }
  get setWorkingCopyArchived(): SqliteBridge['setWorkingCopyArchived'] {
    return this.api.setWorkingCopyArchived;
  }
  get setCruxTrashed(): SqliteBridge['setCruxTrashed'] {
    return this.api.setCruxTrashed;
  }
  get deleteCrux(): SqliteBridge['deleteCrux'] {
    return this.api.deleteCrux;
  }

  get updateCrux(): SqliteBridge['updateCrux'] {
    return this.api.updateCrux;
  }

  get updateWorkingCopyMeta(): SqliteBridge['updateWorkingCopyMeta'] {
    return this.api.updateWorkingCopyMeta;
  }

  async export(): Promise<ArrayBuffer> {
    return this.api.export();
  }

  async inspectImport(data: ArrayBuffer, availableFingerprints?: string[]): Promise<string[]> {
    return this.api.inspectImport(data, availableFingerprints);
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
