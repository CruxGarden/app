import {
  LocalGraphRuntime,
  packPrivateGraph,
  openPrivateGraphArchive,
  type PrivateGraphImport,
  type PrepareImportedWorkspace,
  type GraphSelection,
  type LocalCruxUpdate,
  type LocalWorkingCopyCreate,
  type LocalCruxCreate,
  type PrepareCruxFolder,
  type PrepareWorkingCopyFolder,
  type LocalGraphChange,
  inspectDesktopManifestRecovery,
} from '@cruxgarden/local-api';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { NativeBlobStore } from './native-blobs';
import type { NativeStorage } from './native-storage';
import type {
  FileContentBridge,
  GardenMembershipBridge,
  GardenMoodBridge,
  SettingsBridge,
  InstallationBridge,
} from './bridge';
import { INSTALLATION_COMMANDS } from './bridge';

/** Desktop bridge to the actual API owner. No second SQL connection or fallback. */
export class SqliteApi implements NativeStorage {
  private closed = false;
  private replacing = false;
  private profileGeneration = 0;
  private importing: Promise<void> | null = null;
  private unavailable: Error | null = null;
  private projectionHost?: (
    folder: string,
    entries: import('@cruxgarden/local-api').FileEntry[],
  ) => void | Promise<void>;
  setProjectionHost(host: NonNullable<SqliteApi['projectionHost']>) {
    this.projectionHost = host;
  }

  private importHost?: PrepareImportedWorkspace;
  setImportHost(host: PrepareImportedWorkspace) {
    this.importHost = host;
  }

  async privateArchiveReplacementToken(selection: GraphSelection) {
    this.assertAvailable();
    return this.owner.privateGraphReplacementToken(selection, this.contentStore());
  }

  async exportPrivateArchive(selection: GraphSelection): Promise<Uint8Array> {
    this.assertAvailable();
    const store = this.contentStore();
    const graph = await this.owner.exportPrivateGraph(selection, store);
    return packPrivateGraph(graph, store);
  }

  async inspectPrivateArchive(bytes: Uint8Array) {
    this.assertAvailable();
    const { graph } = await openPrivateGraphArchive(Uint8Array.from(bytes));
    const roots = graph.selection?.roots;
    if (!roots || !graph.cruxes) throw new Error('The archive is missing its graph');
    const root = graph.cruxes.find((row) => row.id === roots[0]);
    if (!root) throw new Error('The archive is missing its selected Crux');
    return {
      root,
      roots,
      includeMembers: graph.selection?.includeMembers === true,
      growthCount: graph.cruxes.filter((row) => row.kind === 'snapshot').length,
    };
  }

  async importPrivateArchive(bytes: Uint8Array, input: Omit<PrivateGraphImport, 'graph'>) {
    this.assertAvailable();
    const prepare = this.importHost;
    if (!prepare) throw new Error('The imported workspace host is unavailable');
    const captured = JSON.parse(JSON.stringify(input));
    const archive = await openPrivateGraphArchive(Uint8Array.from(bytes));
    this.assertAvailable();
    return this.owner.importPrivateGraph(
      { ...captured, graph: archive.graph },
      archive.content,
      this.contentStore(),
      prepare,
    );
  }

  private constructor(
    private readonly owner: LocalGraphRuntime,
    private readonly blobs: NativeBlobStore,
  ) {}

  static async open(filename: string, blobDir: string): Promise<SqliteApi> {
    mkdirSync(dirname(filename), { recursive: true });
    const blobs = new NativeBlobStore(blobDir);
    // No adapter is exposed until the API has checkpointed and completed any
    // inline conversion. All content writes use the existing atomic blob store.
    const owner = await (existsSync(filename)
      ? LocalGraphRuntime.open(filename, {
          contentStore: {
            read: async (fp) => (blobs.blobExists(fp) ? blobs.blobRead(fp) : null),
            write: (fp, bytes) => blobs.blobWriteAsync(fp, bytes),
          },
        })
      : LocalGraphRuntime.create(filename));
    return new SqliteApi(owner, blobs);
  }

  private contentStore() {
    return {
      read: async (fp: string) => (this.blobs.blobExists(fp) ? this.blobs.blobRead(fp) : null),
      write: (fp: string, bytes: Uint8Array) => this.blobs.blobWriteAsync(fp, bytes),
    };
  }

  enterLocalGarden() {
    this.assertAvailable();
    return this.owner.enterLocalGarden();
  }

  /** Attribution is host-owned and must not cross a profile replacement. */
  private async gardenIdentity() {
    this.assertAvailable();
    const generation = this.profileGeneration;
    const identity = await this.owner.get<{ authorId: string | null; homeId: string | null }>(
      `SELECT
        (SELECT value FROM settings WHERE key = 'cruxgarden:local:authorId') AS authorId,
        (SELECT value FROM settings WHERE key = 'cruxgarden:local:homeId') AS homeId`,
    );
    this.assertAvailable();
    if (generation !== this.profileGeneration)
      throw new Error('The Garden changed. Reopen it before changing its contents.');
    if (!identity?.authorId || !identity.homeId)
      throw new Error('Set up the local Garden identity before changing its contents.');
    return { authorId: identity.authorId, homeId: identity.homeId, generation };
  }

  readonly settings: SettingsBridge = {
    list: () => {
      this.assertAvailable();
      return this.owner.listSettings();
    },
    put: (key, value) => {
      this.assertAvailable();
      return this.owner.putSetting(key, value);
    },
    remove: (key) => {
      this.assertAvailable();
      return this.owner.removeSetting(key);
    },
  };

  readonly installation = Object.fromEntries(
    INSTALLATION_COMMANDS.map((name) => [
      name,
      (...args: unknown[]) => {
        this.assertAvailable();
        return (this.owner[name] as (...a: unknown[]) => unknown).apply(this.owner, args);
      },
    ]),
  ) as InstallationBridge;

  readonly gardenMood: GardenMoodBridge = {
    read: (id) => {
      this.assertAvailable();
      return this.owner.readGardenMood(id);
    },
    resolve: (id) => {
      this.assertAvailable();
      return this.owner.resolveGardenMood(id);
    },
    select: async (input) => {
      const captured = structuredClone(input);
      const { generation, ...identity } = await this.gardenIdentity();
      this.assertAvailable();
      if (generation !== this.profileGeneration)
        throw new Error('The Garden changed. Reopen it before changing its Mood.');
      return this.owner.selectGardenMood({ ...captured, ...identity });
    },
  };

  readonly gardenMembership: GardenMembershipBridge = {
    add: async (input) => {
      const { gardenId, memberId } = input;
      const { generation, ...identity } = await this.gardenIdentity();
      this.assertAvailable();
      if (generation !== this.profileGeneration)
        throw new Error('The Garden changed. Reopen it before changing its contents.');
      return this.owner.addGardenMember({ gardenId, memberId, ...identity });
    },
    move: async (input) => {
      const { gardenId, memberId } = input;
      if (!Array.isArray(input.expectedParents))
        throw new Error('Inspect this Crux’s location before moving it');
      const expectedParents = [...input.expectedParents];
      const { generation, ...identity } = await this.gardenIdentity();
      this.assertAvailable();
      if (generation !== this.profileGeneration)
        throw new Error('The Garden changed. Reopen it before changing its contents.');
      return this.owner.moveGardenMember({ gardenId, memberId, expectedParents, ...identity });
    },
    parents: (memberId) => {
      this.assertAvailable();
      return this.owner.gardenParents(memberId);
    },
    remove: (gardenId, memberId) => {
      this.assertAvailable();
      return this.owner.removeGardenMember(gardenId, memberId);
    },
    list: (gardenId, options) => {
      this.assertAvailable();
      return this.owner.listGardenMembers(gardenId, options);
    },
  };

  readonly fileContent: FileContentBridge = {
    history: (id) => {
      this.assertAvailable();
      return this.owner.listEditHistory(id);
    },
    checkpoint: (input) => {
      this.assertAvailable();
      return this.owner.createEditCheckpoint(input, this.contentStore());
    },
    inspectCheckpoint: (id, checkpointId) => {
      this.assertAvailable();
      return this.owner.inspectEditCheckpoint(id, checkpointId, this.contentStore());
    },
    restoreCheckpoint: (input) => {
      this.assertAvailable();
      return this.owner.restoreEditCheckpoint(input, this.contentStore());
    },
    lookup: (input) => {
      this.assertAvailable();
      return this.owner.lookupFileContent(input, this.contentStore());
    },
    finishProjection: (id) => {
      this.assertAvailable();
      if (!this.projectionHost) throw new Error('Project Folder host is unavailable');
      return this.owner.finishContentProjection(id, this.contentStore(), this.projectionHost);
    },
    head: (id) => {
      this.assertAvailable();
      return this.owner.fileContentHead(id);
    },
    list: (input) => {
      this.assertAvailable();
      return this.owner.listFileContent(input, this.contentStore());
    },
    read: (input) => {
      this.assertAvailable();
      return this.owner.readFileContent(input, this.contentStore());
    },
    edit: (input) => {
      this.assertAvailable();
      return this.owner.editFileContent(input, this.contentStore());
    },
    restore: (input) => {
      this.assertAvailable();
      return this.owner.restoreGrowthContent(input, this.contentStore());
    },
    snapshot: (input) => {
      this.assertAvailable();
      return this.owner.createGrowthSnapshot(input, this.contentStore());
    },
  };

  run(sql: string, params?: unknown[]) {
    this.assertAvailable();
    return this.owner.run(sql, params);
  }
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    this.assertAvailable();
    return this.owner.get<T>(sql, params);
  }
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
    this.assertAvailable();
    return this.owner.all<T>(sql, params);
  }
  onChange(callback: (change: LocalGraphChange) => void): () => void {
    this.assertAvailable();
    return this.owner.onChange(callback);
  }
  mergeCruxMeta(id: string, patch: Record<string, unknown>) {
    this.assertAvailable();
    return this.owner.mergeCruxMeta(id, patch);
  }
  createCrux(input: LocalCruxCreate, prepareFolder?: PrepareCruxFolder) {
    this.assertAvailable();
    return this.owner.createCrux(input, prepareFolder, this.contentStore());
  }
  updateCrux(id: string, patch: LocalCruxUpdate) {
    this.assertAvailable();
    return this.owner.updateCrux(id, patch);
  }
  prepareWorkingCopyFolder(id: string, revision: number, prepare: PrepareWorkingCopyFolder) {
    this.assertAvailable();
    return this.owner.prepareWorkingCopyFolder(id, revision, prepare);
  }
  finishWorkingCopySetup(id: string, revision: number, phase: 'ready' | 'failed') {
    this.assertAvailable();
    return this.owner.finishWorkingCopySetup(id, revision, phase);
  }
  createWorkingCopy(input: LocalWorkingCopyCreate) {
    this.assertAvailable();
    return this.owner.createWorkingCopy(input, this.contentStore());
  }
  inspectTaskHistory(input: Parameters<LocalGraphRuntime['inspectTaskHistory']>[0]) {
    this.assertAvailable();
    return this.owner.inspectTaskHistory(input, this.contentStore());
  }
  readTaskHistoryFile(
    input: Parameters<LocalGraphRuntime['readTaskHistoryFile']>[0],
    root: string,
    path: string,
  ) {
    this.assertAvailable();
    return this.owner.readTaskHistoryFile(input, root, path, this.contentStore());
  }

  workingCopyBase(id: string) {
    this.assertAvailable();
    return this.owner.workingCopyBase(id, this.contentStore());
  }
  saveTaskReview(reviewData: string, expectedData?: string) {
    this.assertAvailable();
    return this.owner.saveTaskReview(reviewData, expectedData, this.contentStore());
  }
  beginTaskMerge(id: string, reviewData: string) {
    this.assertAvailable();
    return this.owner.beginTaskMerge(id, reviewData, this.contentStore());
  }
  releaseTaskReview(id: string) {
    this.assertAvailable();
    return this.owner.releaseTaskReview(id);
  }
  completeTaskMerge(id: string) {
    this.assertAvailable();
    return this.owner.completeTaskMerge(id, this.contentStore());
  }
  setWorkingCopyArchived(id: string, archived: boolean, revision: number) {
    this.assertAvailable();
    return this.owner.setWorkingCopyArchived(id, archived, revision);
  }
  setCruxTrashed(id: string, trashed: boolean) {
    this.assertAvailable();
    return this.owner.setCruxTrashed(id, trashed);
  }
  deleteCrux(id: string) {
    this.assertAvailable();
    return this.owner.deleteCrux(id);
  }
  updateWorkingCopyMeta(id: string, patch: Record<string, unknown>, title?: string) {
    this.assertAvailable();
    return this.owner.updateWorkingCopyMeta(id, patch, title);
  }
  export() {
    this.assertAvailable();
    return this.owner.exportDatabase();
  }
  async inspectImport(data: ArrayBuffer, availableFingerprints?: string[]): Promise<string[]> {
    this.assertAvailable();
    if (
      availableFingerprints !== undefined &&
      (!Array.isArray(availableFingerprints) ||
        availableFingerprints.some((fp) => typeof fp !== 'string' || !/^[a-f0-9]{64}$/.test(fp)))
    )
      throw new Error('Use an archive content inventory');
    const allowed = availableFingerprints === undefined ? null : new Set(availableFingerprints);
    const result = await inspectDesktopManifestRecovery(data, {
      read: async (fp) => {
        if (allowed && !allowed.has(fp))
          throw new Error(`Garden archive is missing required content: ${fp}`);
        return this.blobs.blobExists(fp) ? this.blobs.blobRead(fp) : null;
      },
    });
    // The API validates the supported schema; manifest-backed images start at 5.
    // Keep admission aligned with replaceDatabaseWithContent as the API evolves.
    if (result.schemaVersion < 5) throw new Error('Use a current-format database image');
    return result.fingerprints;
  }
  import(data: ArrayBuffer): Promise<void> {
    this.assertAvailable();
    this.replacing = true;
    this.profileGeneration++;
    this.importing = this.replace(data);
    return this.importing;
  }

  private async replace(data: ArrayBuffer): Promise<void> {
    try {
      // Intake has staged content; the owner verifies both incoming and rollback
      // roots while replacement admission excludes every other graph writer.
      await this.owner.replaceDatabaseWithContent(data, this.contentStore());
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
  async close(): Promise<void> {
    this.closed = true;
    try {
      await this.importing;
    } catch {
      // The import caller observes its error; still drain/close the owner. A
      // recovery-required owner continues to refuse unsafe shutdown itself.
    }
    await this.owner.close();
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
