import { nativeProjectHost } from './native-project-host';
import { importedWorkspacePreparer } from '../../electron/src/import-workspaces';
import { projectFileOperation } from '../../electron/src/project-file-operation';
import { projectRename } from '../../electron/src/project-rename';
import { mkdtemp, mkdir, rm, writeFile, chmod, readdir } from 'node:fs/promises';
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
  const { projects, bridge: project } = await nativeProjectHost(dir, blobs);
  let restoreWindow: (() => void) | undefined;
  const folders = new Set<string>();
  let importFailure: string | undefined;
  const folder = async (id: string) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Use an isolated test folder identity.');
    const path = join(dir, 'projects', id);
    await mkdir(path, { recursive: true });
    folders.add(path);
    projects.registerFolder(path);
    return path;
  };
  const configure = () => {
    api.setProjectionOperationHost((path, intent, apply, bytes) => {
      if (!folders.has(path)) throw new Error('Rename outside the isolated test folders refused.');
      if (intent.kind === 'rename')
        projectRename(
          path,
          join(path, intent.source.path),
          join(path, intent.entry.path),
          intent,
          apply,
        );
      else
        projectFileOperation(
          path,
          join(path, intent.kind === 'write' ? intent.entry.path : intent.source.path),
          intent,
          apply,
          bytes,
        );
    });
    api.setProjectionHost(async (path, entries) => {
      if (!folders.has(path))
        throw new Error('Projection outside the isolated test folders refused.');
      await mkdir(path, { recursive: true });
      for (const entry of await readdir(path))
        if (entry !== '.crux-recovery')
          await rm(join(path, entry), { recursive: true, force: true });
      for (const entry of entries) {
        const target = join(path, entry.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, api.blobRead(entry.fingerprint));
        await chmod(target, entry.mode);
      }
    });
    api.setImportHost(async (input) => {
      if (importFailure) {
        const message = importFailure;
        importFailure = undefined;
        throw new Error(message);
      }
      // Replacement must prepare a fresh folder, never reuse the previous
      // registration; allocation is isolated exactly like ordinary creation.
      const path = await importedWorkspacePreparer(projects, blobs)(input);
      folders.add(path);
      return path;
    });
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
    inspectTaskHistory: (input) => api.inspectTaskHistory(input),
    readTaskHistoryFile: (input, root, path) => api.readTaskHistoryFile(input, root, path),
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
      restoreWindow?.();
      await rm(dir, { recursive: true, force: true });
    },
  };
  return {
    client,
    project,
    /** Enable actual desktop filesystem projection for service journeys. */
    installProjectBridge() {
      if (restoreWindow) return;
      const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
      const window = Object.assign(new EventTarget(), {
        electronAPI: { project },
        requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
      });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: window,
      });
      restoreWindow = () => {
        if (previous) Object.defineProperty(globalThis, 'window', previous);
        else Reflect.deleteProperty(globalThis, 'window');
        restoreWindow = undefined;
      };
    },
    faultSql: (sql: string, params?: unknown[]) => api.run(sql, params),
    failNextImportHost(message: string) {
      importFailure = message;
    },
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
