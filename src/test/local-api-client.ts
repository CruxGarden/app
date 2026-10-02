import { mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SqliteApi } from '../../electron/src/sqlite-api';
import type { ISqliteClient } from '@/services/sqlite/client';
import { assertRead } from '@/services/sqlite/electron-client';

/** Actual vendored API + native SQLite, in an isolated directory. No SQL.js
 * command reimplementation. Renderer writes refuse exactly as on desktop;
 * faultSql is deliberately separate and available only to the test owner. */
export async function createLocalApiTestClient() {
  const dir = await mkdtemp(join(tmpdir(), 'crux-api-test-'));
  const filename = join(dir, 'garden.db');
  const blobs = join(dir, 'blobs');
  let api = await SqliteApi.open(filename, blobs);
  const folders = new Set<string>();
  const folder = async (id: string) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Use an isolated test folder identity.');
    const path = join(dir, 'projects', id);
    await mkdir(path, { recursive: true });
    folders.add(path);
    return path;
  };
  const configure = () => {
    api.setProjectionHost(async (path, entries) => {
      if (!folders.has(path))
        throw new Error('Projection outside the isolated test folders refused.');
      await rm(path, { recursive: true, force: true });
      await mkdir(path, { recursive: true });
      for (const entry of entries) {
        const target = join(path, entry.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, api.blobRead(entry.fingerprint));
        await chmod(target, entry.mode);
      }
    });
    api.setImportHost(async (input) => folder(input.id));
  };
  configure();
  const client: ISqliteClient = {
    init: async () => {},
    run: async () => {
      throw new Error('Raw SQL writes are closed on desktop; use a named command.');
    },
    get: async (sql, params) => {
      assertRead(sql);
      return api.get(sql, params);
    },
    all: async (sql, params) => {
      assertRead(sql);
      return api.all(sql, params);
    },
    enterLocalGarden: () => api.enterLocalGarden(),
    settings: api.settings,
    installation: api.installation,
    gardenMembership: api.gardenMembership,
    // Notices are integration-tested through real IPC; these service tests drive
    // their own refreshes rather than launching background UI projections.
    onChange: () => () => {},
    fileContent: api.fileContent,
    privateArchive: {
      replacementToken: (input) => api.privateArchiveReplacementToken(input),
      export: (input) => api.exportPrivateArchive(input),
      inspect: (bytes) => api.inspectPrivateArchive(bytes),
      import: (bytes, input) => api.importPrivateArchive(bytes, input),
    },
    createCrux: (input) => api.createCrux(input, (id) => folder(id)),
    mergeCruxMeta: (id, patch) => api.mergeCruxMeta(id, patch),
    updateCrux: (id, patch) => api.updateCrux(id, patch),
    prepareWorkingCopyFolder: (id, revision) =>
      api.prepareWorkingCopyFolder(id, revision, (id) => folder(id)),
    finishWorkingCopySetup: (id, revision, phase) =>
      api.finishWorkingCopySetup(id, revision, phase),
    createWorkingCopy: (input) => api.createWorkingCopy(input),
    workingCopyBase: (id) => api.workingCopyBase(id),
    saveTaskReview: (data, expected) => api.saveTaskReview(data, expected),
    beginTaskMerge: (id, data) => api.beginTaskMerge(id, data),
    releaseTaskReview: (id) => api.releaseTaskReview(id),
    completeTaskMerge: (id) => api.completeTaskMerge(id),
    setWorkingCopyArchived: (id, archived, revision) =>
      api.setWorkingCopyArchived(id, archived, revision),
    updateWorkingCopyMeta: (id, patch, title) => api.updateWorkingCopyMeta(id, patch, title),
    setCruxTrashed: (id, trashed) => api.setCruxTrashed(id, trashed),
    deleteCrux: (id) => api.deleteCrux(id),
    export: () => api.export(),
    import: (data) => api.import(data),
    inspectImport: (data, inventory) => api.inspectImport(data, inventory),
    blobWrite: async (id, bytes) => api.blobWrite(id, bytes),
    blobRead: async (id) => api.blobRead(id),
    blobDelete: async (id) => api.blobDelete(id),
    blobExists: async (id) => api.blobExists(id),
    blobWipeAll: async () => api.blobWipeAll(),
    close: async () => {
      await api.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
  return {
    client,
    faultSql: (sql: string, params?: unknown[]) => api.run(sql, params),
    async restart() {
      await api.close();
      api = await SqliteApi.open(filename, blobs);
      configure();
      client.settings = api.settings;
      client.installation = api.installation;
      client.gardenMembership = api.gardenMembership;
      client.fileContent = api.fileContent;
    },
  };
}
