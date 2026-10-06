import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { DiskUsageSummary } from './bridge';

/**
 * Local disk-use summary and cache clearing (ADR 0085). No Electron import:
 * main supplies the layout and the Chromium sessions, so the walker and the
 * category boundaries are unit-tested on plain temp directories.
 *
 * Categories never overlap: each directory is walked once, broader walks skip
 * the narrower roots, and a file with several hard links (recovery points
 * link to Project Folder files) is counted only where it is first seen.
 */

/** Chromium's regenerable caches inside a profile directory (and each
 * `Partitions/<name>/`). Never Local Storage, IndexedDB, cookies or service
 * worker storage: those hold state the app or a Workshop page relies on. */
export const CHROMIUM_CACHE_DIRS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GrShaderCache',
  'ShaderCache',
] as const;

/** SQLite files of the local API database (metadata, edit/Growth/Task history). */
export const DATABASE_FILES = ['cruxgarden.db', 'cruxgarden.db-wal', 'cruxgarden.db-shm'];

export interface DiskLayout {
  gardenRoot: string;
  userData: string;
  /** Registered Project Folders (Main and Task copies), excluding installed tools. */
  projectFolders: string[];
  /** Project Folders of installed Crux Tools (hidden `kind: 'tool'` Cruxes). */
  toolFolders: string[];
  /** Blob Store fingerprints that are installed Crux Tool packages. */
  toolBlobs: string[];
  blobDir: string;
}

export interface WalkBudget {
  deadline: number;
  entries: number;
  truncated: boolean;
  /** dev:ino of multiply-linked files already counted. */
  seen: Set<string>;
}

export function walkBudget(ms = 15_000, entries = 1_000_000): WalkBudget {
  return { deadline: Date.now() + ms, entries, truncated: false, seen: new Set() };
}

const BATCH = 64;

/** Size of a file or directory tree in bytes. Symlinks are never followed or
 * counted; unreadable entries (EACCES, vanished) are skipped; paths in `skip`
 * are not entered. Stops (and marks the budget truncated) at the budget. */
export async function treeSize(
  root: string,
  budget: WalkBudget,
  skip: ReadonlySet<string> = new Set(),
): Promise<number> {
  let bytes = 0;
  const countFile = (stat: { size: number; nlink: number; dev: number; ino: number }) => {
    if (stat.nlink > 1) {
      const key = `${stat.dev}:${stat.ino}`;
      if (budget.seen.has(key)) return;
      budget.seen.add(key);
    }
    bytes += stat.size;
  };
  const exhausted = () => {
    if (budget.entries <= 0 || Date.now() > budget.deadline) budget.truncated = true;
    return budget.truncated;
  };
  if (skip.has(root)) return 0;
  let top;
  try {
    top = await fs.lstat(root);
  } catch {
    return 0;
  }
  if (top.isSymbolicLink()) return 0;
  if (top.isFile()) {
    countFile(top);
    return bytes;
  }
  if (!top.isDirectory()) return 0;
  const stack = [root];
  while (stack.length) {
    if (exhausted()) break;
    const dir = stack.pop()!;
    let names: import('node:fs').Dirent[];
    try {
      names = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (let i = 0; i < names.length; i += BATCH) {
      if (exhausted()) break;
      const batch = names.slice(i, i + BATCH);
      budget.entries -= batch.length;
      await Promise.all(
        batch.map(async (entry) => {
          const full = path.join(dir, entry.name);
          if (entry.isSymbolicLink() || skip.has(full)) return;
          if (entry.isDirectory()) {
            stack.push(full);
            return;
          }
          if (!entry.isFile()) return;
          try {
            const stat = await fs.lstat(full);
            if (stat.isFile()) countFile(stat);
          } catch {
            // EACCES, EPERM or removed meanwhile: not ours to report.
          }
        }),
      );
    }
  }
  return bytes;
}

async function canonical(p: string): Promise<string> {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/** The cache directories present in a profile, including its partitions. */
export async function chromiumCacheDirs(userData: string): Promise<string[]> {
  const profiles = [userData];
  try {
    for (const entry of await fs.readdir(path.join(userData, 'Partitions'), {
      withFileTypes: true,
    }))
      if (entry.isDirectory()) profiles.push(path.join(userData, 'Partitions', entry.name));
  } catch {
    // No partitions yet.
  }
  const dirs: string[] = [];
  for (const profile of profiles)
    for (const name of CHROMIUM_CACHE_DIRS) {
      const dir = path.join(profile, name);
      try {
        if ((await fs.lstat(dir)).isDirectory()) dirs.push(dir);
      } catch {
        // Absent.
      }
    }
  return dirs;
}

/** Total bytes in the regenerable caches (what `clearCaches` can free). */
export async function cacheSize(userData: string, budget = walkBudget()): Promise<number> {
  const root = await canonical(userData);
  let bytes = 0;
  for (const dir of await chromiumCacheDirs(root)) bytes += await treeSize(dir, budget);
  return bytes;
}

/** Drop folders nested inside another listed folder (they are counted with it). */
function outermost(folders: string[]): string[] {
  const sorted = [...new Set(folders)].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const folder of sorted)
    if (!kept.some((outer) => folder === outer || folder.startsWith(outer + path.sep)))
      kept.push(folder);
  return kept;
}

export async function measureDiskUsage(
  layout: DiskLayout,
  budget = walkBudget(),
  now: () => Date = () => new Date(),
): Promise<DiskUsageSummary> {
  const gardenRoot = await canonical(layout.gardenRoot);
  const userData = await canonical(layout.userData);
  const blobDir = await canonical(layout.blobDir);
  const tools = await Promise.all(layout.toolFolders.map(canonical));
  const projectFolders = outermost(
    (await Promise.all(layout.projectFolders.map(canonical))).filter(
      (folder) => !tools.includes(folder),
    ),
  );
  const toolFolders = outermost(tools).filter(
    (folder) => !projectFolders.some((outer) => folder.startsWith(outer + path.sep)),
  );
  const runtimeStore = path.join(gardenRoot, 'runtimes');
  const nativeTools = path.join(userData, 'tools');
  const toolBlobs = layout.toolBlobs
    .filter((fingerprint) => /^[a-f0-9]{64}$/.test(fingerprint))
    .map((fingerprint) => path.join(blobDir, fingerprint));
  const caches = await chromiumCacheDirs(userData);
  const databases = DATABASE_FILES.map((name) => path.join(userData, name));
  const recovery = (folder: string) => path.join(folder, '.crux-recovery');

  // Every root a broader walk must not enter again.
  const claimed = new Set<string>([
    ...projectFolders,
    ...toolFolders,
    runtimeStore,
    nativeTools,
    blobDir,
    ...caches,
    ...databases,
  ]);
  const without = (...roots: string[]) => {
    const set = new Set(claimed);
    for (const root of roots) set.delete(root);
    return set;
  };

  let projectFoldersBytes = 0;
  for (const folder of projectFolders)
    projectFoldersBytes += await treeSize(
      folder,
      budget,
      new Set([...without(folder), recovery(folder)]),
    );

  let historyBytes = 0;
  for (const file of databases) historyBytes += await treeSize(file, budget);
  for (const folder of projectFolders) historyBytes += await treeSize(recovery(folder), budget);

  let toolInstallsBytes = 0;
  for (const root of [...toolFolders, runtimeStore, nativeTools])
    toolInstallsBytes += await treeSize(root, budget, without(root));
  for (const blob of toolBlobs) toolInstallsBytes += await treeSize(blob, budget);

  const blobStoreBytes = await treeSize(
    blobDir,
    budget,
    new Set([...without(blobDir), ...toolBlobs]),
  );

  let cacheBytes = 0;
  for (const dir of caches) cacheBytes += await treeSize(dir, budget);

  // What is left: Garden Root files outside Project Folders (garden memory,
  // reports, leftovers) and the rest of the profile (settings, logs, local
  // storage). The two roots may nest; never walk one inside the other twice.
  const otherBytes =
    gardenRoot === userData
      ? await treeSize(gardenRoot, budget, claimed)
      : (await treeSize(gardenRoot, budget, new Set([...claimed, userData]))) +
        (await treeSize(userData, budget, new Set([...claimed, gardenRoot])));

  const gardenBytes =
    projectFoldersBytes + blobStoreBytes + historyBytes + toolInstallsBytes + otherBytes;
  return {
    gardenBytes,
    projectFoldersBytes,
    blobStoreBytes,
    historyBytes,
    toolInstallsBytes,
    cacheBytes,
    otherBytes,
    totalBytes: gardenBytes + cacheBytes,
    complete: !budget.truncated,
    measuredAt: now().toISOString(),
    roots: { garden: gardenRoot, userData },
  };
}

/** The Electron session surface `clearCaches` uses — nothing that deletes paths. */
export interface CacheSession {
  clearCache(): Promise<void>;
  clearCodeCaches(options: { urls?: string[] }): Promise<void>;
  clearStorageData(options: { storages: string[] }): Promise<void>;
}

/**
 * Clear only what Chromium regenerates on demand: the HTTP cache, compiled
 * code cache and GPU shader cache of the given sessions, through Chromium's
 * own APIs (never by deleting files a live process holds). Freed bytes are
 * measured, not estimated.
 */
export async function clearCaches(
  userData: string,
  sessions: readonly CacheSession[],
): Promise<{ freedBytes: number }> {
  const before = await cacheSize(userData);
  for (const session of new Set(sessions)) {
    await session.clearCache().catch(() => undefined);
    await session.clearCodeCaches({}).catch(() => undefined);
    await session.clearStorageData({ storages: ['shadercache'] }).catch(() => undefined);
  }
  const after = await cacheSize(userData);
  return { freedBytes: Math.max(0, before - after) };
}

/** One measurement at a time, reused for a minute (Settings may ask often). */
export class DiskUsageMeter {
  private last: { at: number; value: DiskUsageSummary } | null = null;
  private running: Promise<DiskUsageSummary> | null = null;

  constructor(
    private readonly measure: () => Promise<DiskUsageSummary>,
    private readonly maxAgeMs = 60_000,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  read(fresh = false): Promise<DiskUsageSummary> {
    if (!fresh && this.last && this.clock() - this.last.at < this.maxAgeMs)
      return Promise.resolve(this.last.value);
    if (this.running) return this.running;
    this.running = this.measure()
      .then((value) => {
        this.last = { at: this.clock(), value };
        return value;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  invalidate(): void {
    this.last = null;
  }
}
