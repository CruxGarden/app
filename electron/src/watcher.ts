const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const createIgnore = require('ignore');

/**
 * Project Folder watcher (ADR 0001 — the disk → store direction).
 *
 * Watches each registered Project Folder and reports external changes to the
 * renderer as debounced batches. The renderer's ingestion service fingerprints
 * changed files and records them in the blob store + history.
 *
 * Layers of protection:
 * - Ignore rules: defaults (node_modules, dist, .astro, .git, OS litter) plus
 *   the folder's own .cruxignore (gitignore syntax), reloaded when it changes.
 * - Atomic saves: chokidar's awaitWriteFinish holds events until the file
 *   stops changing, so editors' temp-write-then-rename pattern lands as one
 *   clean write.
 * - Self-write suppression: the app's own writes (markSelfWrite) are filtered
 *   here; the renderer additionally skips fingerprint-identical content.
 * - Folder-deletion guard: if the Project Folder itself is gone at flush time,
 *   the unlink storm is discarded and a single `folder-missing` event is sent
 *   instead — a missing folder must never cascade into artifact deletion.
 */

export const DEFAULT_IGNORES = [
  'node_modules/',
  'dist/',
  '.astro/',
  '.git/',
  '.crux/', // app-internal per-folder state (MCP token, ADR 0013) — never ingested or published
  '.DS_Store',
  'Thumbs.db',
  '*.swp',
  '*.swx',
  '.#*',
  '*~',
];

export interface WatchEvent {
  type: 'write' | 'delete' | 'mkdir' | 'rmdir';
  relPath: string;
}

export interface WatchBatch {
  folder: string;
  folderMissing?: boolean;
  events: WatchEvent[];
}

const DEBOUNCE_MS = 300;
const MAX_WAIT_MS = 2000;
const SELF_WRITE_TTL_MS = 3000;

class FolderWatch {
  private watcher: any;
  private pending = new Map<string, WatchEvent>(); // relPath -> latest event
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private firstEventAt = 0;
  private ig: any;

  constructor(
    readonly folder: string,
    private onBatch: (batch: WatchBatch) => void,
    private isSelfWrite: (folder: string, relPath: string) => boolean,
  ) {
    this.loadIgnores();
    this.watcher = chokidar.watch(folder, {
      ignoreInitial: true,
      ignored: (p: string) => this.isIgnored(p),
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    });
    this.watcher.on('add', (p: string) => this.record('write', p));
    this.watcher.on('change', (p: string) => this.record('write', p));
    this.watcher.on('unlink', (p: string) => this.record('delete', p));
    this.watcher.on('addDir', (p: string) => this.record('mkdir', p));
    this.watcher.on('unlinkDir', (p: string) => this.record('rmdir', p));
    this.watcher.on('error', () => {});
  }

  private loadIgnores() {
    this.ig = createIgnore().add(DEFAULT_IGNORES);
    try {
      const cruxignore = fs.readFileSync(path.join(this.folder, '.cruxignore'), 'utf8');
      this.ig.add(cruxignore);
    } catch {
      /* no .cruxignore */
    }
  }

  private rel(absPath: string): string | null {
    const rel = path.relative(this.folder, absPath);
    if (!rel || rel.startsWith('..')) return null;
    return rel.split(path.sep).join('/');
  }

  private isIgnored(absPath: string): boolean {
    const rel = this.rel(absPath);
    if (rel === null) return false; // the folder itself — never ignore the root
    if (!rel) return false;
    // Directory-only patterns ("node_modules/") need the trailing slash to
    // match a directory path — test both forms.
    return this.ig.ignores(rel) || this.ig.ignores(rel + '/');
  }

  private record(type: WatchEvent['type'], absPath: string) {
    const rel = this.rel(absPath);
    if (!rel) return;

    // Editing .cruxignore re-arms the rules (and is itself ingested)
    if (rel === '.cruxignore') this.loadIgnores();

    if (this.isSelfWrite(this.folder, rel)) return;

    this.pending.set(rel, { type, relPath: rel });
    if (!this.firstEventAt) this.firstEventAt = Date.now();

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    const overdue = Date.now() - this.firstEventAt >= MAX_WAIT_MS;
    this.debounceTimer = setTimeout(() => this.flush(), overdue ? 0 : DEBOUNCE_MS);
  }

  private flush() {
    this.debounceTimer = null;
    this.firstEventAt = 0;
    const events = [...this.pending.values()];
    this.pending.clear();
    if (!events.length) return;

    // Folder-deletion guard: never turn a missing folder into mass deletion
    if (!fs.existsSync(this.folder)) {
      this.onBatch({ folder: this.folder, folderMissing: true, events: [] });
      return;
    }
    this.onBatch({ folder: this.folder, events });
  }

  async close() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.watcher.close();
  }
}

export class ProjectWatcher {
  private watches = new Map<string, FolderWatch>();
  private selfWrites = new Map<string, number>(); // `${folder}::${rel}` -> expiry

  constructor(private sendBatch: (batch: WatchBatch) => void) {}

  /** Record an app-originated write so the watcher ignores its echo. */
  markSelfWrite(folder: string, relPath: string): void {
    this.selfWrites.set(`${path.resolve(folder)}::${relPath}`, Date.now() + SELF_WRITE_TTL_MS);
    // Opportunistic pruning
    if (this.selfWrites.size > 1000) {
      const now = Date.now();
      for (const [k, exp] of this.selfWrites) if (exp < now) this.selfWrites.delete(k);
    }
  }

  private isSelfWrite = (folder: string, relPath: string): boolean => {
    const key = `${path.resolve(folder)}::${relPath}`;
    const expiry = this.selfWrites.get(key);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.selfWrites.delete(key);
      return false;
    }
    return true;
  };

  watch(folder: string): void {
    const key = path.resolve(folder);
    if (this.watches.has(key)) return;
    if (!fs.existsSync(key)) return;
    this.watches.set(key, new FolderWatch(key, this.sendBatch, this.isSelfWrite));
  }

  async unwatch(folder: string): Promise<void> {
    const key = path.resolve(folder);
    const watch = this.watches.get(key);
    if (watch) {
      this.watches.delete(key);
      await watch.close();
    }
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.watches.values()].map((w) => w.close()));
    this.watches.clear();
  }
}
