import { isPrivateProjectPath } from './project-private';
const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  isInside,
  realpathLongestPrefix,
  resolveInsideOrThrow,
  sanitizeFolderName: sanitizeName,
  toPosixRel,
} = require('./paths');

/**
 * Project Folders (ADR 0001) — main-process side.
 *
 * The Garden Root (default ~/CruxGarden) holds one real Project Folder per
 * crux. Only explicitly registered or freshly allocated Project Folders can
 * receive operations. A Garden Root is a location for allocation, not a grant
 * to every directory under it.
 */

/** What this process last learned about a file's bytes; valid while its stat signature holds. */
interface ContentNote {
  signature: string;
  fingerprint: string;
  size: number;
  utf8: boolean | undefined;
}
function statSignature(stat: import('fs').Stats): string {
  return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
/** Strict UTF-8 validity without building a string; a binary file fails fast. */
function isUtf8Bytes(bytes: Uint8Array): boolean {
  const { isUtf8 } = require('buffer');
  if (typeof isUtf8 === 'function') return isUtf8(bytes);
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

interface DesktopConfigData {
  gardenRoot: string;
  /** Previous allocation locations; only registered projects there remain operable. */
  knownRoots: string[];
  /** Check GitHub Releases for updates on launch (ADR 0008: visible, disableable). */
  autoUpdate: boolean;
}

export class DesktopConfig {
  private filePath: string;
  private data: DesktopConfigData | null = null;

  constructor(
    userDataPath: string,
    private initialGardenRoot?: string,
  ) {
    this.filePath = path.join(userDataPath, 'desktop-config.json');
  }

  private defaults(): DesktopConfigData {
    const root = this.initialGardenRoot || path.join(os.homedir(), 'CruxGarden');
    return { gardenRoot: root, knownRoots: [root], autoUpdate: true };
  }

  load(): DesktopConfigData {
    if (this.data) return this.data;
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const defaults = this.defaults();
      this.data = {
        gardenRoot: raw.gardenRoot || defaults.gardenRoot,
        knownRoots:
          Array.isArray(raw.knownRoots) && raw.knownRoots.length
            ? raw.knownRoots
            : defaults.knownRoots,
        autoUpdate: raw.autoUpdate !== false,
      };
    } catch {
      this.data = this.defaults();
    }
    return this.data;
  }

  get gardenRoot(): string {
    return this.load().gardenRoot;
  }

  setGardenRoot(root: string): void {
    const data = this.load();
    data.gardenRoot = root;
    if (!data.knownRoots.includes(root)) data.knownRoots.push(root);
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  get knownRoots(): string[] {
    return this.load().knownRoots;
  }

  get autoUpdate(): boolean {
    return this.load().autoUpdate;
  }

  setAutoUpdate(on: boolean): void {
    const data = this.load();
    data.autoUpdate = on;
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}

/** Filesystem names a slug may not produce (see paths.ts — Windows-aware). */
function sanitizeFolderName(slug: string): string {
  return sanitizeName(slug);
}

export class ProjectFolders {
  private folders = new Map<string, string>();

  constructor(private config: DesktopConfig) {}

  ensureGardenRoot(): string {
    const root = this.config.gardenRoot;
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  /** Host-only startup registration from the local database, never an IPC grant. */
  registerFolder(folder: string): string {
    if (typeof folder !== 'string' || !path.isAbsolute(folder))
      throw new Error('Use a registered Project Folder');
    const resolved = path.resolve(folder);
    const canonical = realpathLongestPrefix(resolved);
    if (
      this.config.knownRoots.some((root: string) => realpathLongestPrefix(root) === canonical) ||
      !this.config.knownRoots.some(
        (root: string) => isInside(root, resolved) && realpathLongestPrefix(root) !== canonical,
      ) ||
      (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink())
    )
      throw new Error('Use a registered Project Folder inside a Garden root');
    this.folders.set(resolved, canonical);
    this.folders.set(canonical, canonical);
    return canonical;
  }

  private assertKnownFolder(folder: string): string {
    if (typeof folder !== 'string' || !path.isAbsolute(folder))
      throw new Error('Use a registered Project Folder');
    const resolved = path.resolve(folder);
    const canonical = this.folders.get(resolved);
    if (!canonical || realpathLongestPrefix(resolved) !== canonical)
      throw new Error('Use a registered Project Folder; this path is not authorized');
    if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink())
      throw new Error('A Project Folder cannot be replaced with a symlink');
    return canonical;
  }

  /** Resolve a relative path inside a project folder; reject traversal. */
  private resolveInside(folder: string, relPath: string): string {
    const base = this.assertKnownFolder(folder);
    if (isPrivateProjectPath(relPath))
      throw new Error('This path is reserved for Crux Garden recovery files.');
    return resolveInsideOrThrow(base, relPath);
  }

  /** Create a Project Folder for a slug; `-2`, `-3`… on collision. */
  createFolder(slug: string): string {
    const root = this.ensureGardenRoot();
    const base = sanitizeFolderName(slug);
    let name = base;
    let counter = 2;
    for (;;) {
      const folder = path.join(root, name);
      try {
        // Exclusive allocation: never adopt a directory/symlink created by another writer.
        fs.mkdirSync(folder);
        return this.registerFolder(folder);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        name = `${base}-${counter++}`;
      }
    }
  }

  folderExists(folder: string): boolean {
    try {
      return fs.statSync(this.assertKnownFolder(folder)).isDirectory();
    } catch {
      return false;
    }
  }

  /** Recreate a registered folder that went missing (restore-from-history). */
  ensureFolder(folder: string): string {
    const resolved = this.assertKnownFolder(folder);
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  }

  writeFile(folder: string, relPath: string, data: Uint8Array): void {
    const target = this.resolveInside(folder, relPath);
    this.assertNoSymlinks(folder, relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.crux-write-${require('crypto').randomUUID()}`;
    try {
      const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o644;
      fs.writeFileSync(temporary, Buffer.from(data), { mode });
      fs.renameSync(temporary, target);
      this.noteOwnWrite(target);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  // The app's own writes, by the modification time they left on disk. The
  // watcher asks for them when it reports a write: the same time means the
  // event is the echo of our write; a later time means someone else wrote the
  // file after us (an editor or an agent inside the debounce window), and the
  // renderer must read it rather than trust what it wrote.
  private ownWrites = new Map<string, number>();
  private noteOwnWrite(target: string): void {
    try {
      if (this.ownWrites.size > 50000) this.ownWrites.clear();
      this.ownWrites.set(target, fs.statSync(target).mtimeMs);
    } catch {
      /* the file vanished already; the watcher will report that */
    }
  }
  /** The modification time of the app's last write to this file, consumed on first ask. */
  ownWriteMtime(absPath: string): number | undefined {
    const at = this.ownWrites.get(absPath);
    if (at !== undefined) this.ownWrites.delete(absPath);
    return at;
  }

  readFile(folder: string, relPath: string): Uint8Array {
    this.assertNoSymlinks(folder, relPath);
    return new Uint8Array(fs.readFileSync(this.resolveInside(folder, relPath)));
  }

  deleteFile(folder: string, relPath: string): void {
    this.assertNoSymlinks(folder, relPath);
    const target = this.resolveInside(folder, relPath);
    try {
      fs.unlinkSync(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    // Prune now-empty parent directories up to the project folder
    const base = this.assertKnownFolder(folder);
    let dir = path.dirname(target);
    while (dir !== base && dir.startsWith(base + path.sep)) {
      try {
        if (fs.readdirSync(dir).length > 0) break;
        fs.rmdirSync(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }

  projectRename(
    folder: string,
    intent: import('@cruxgarden/local-api').FileRenameIntent,
    apply: boolean,
  ): void {
    this.assertNoSymlinks(folder, intent.source.path);
    this.assertNoSymlinks(folder, intent.entry.path);
    const base = this.assertKnownFolder(folder);
    require('./project-rename').projectRename(
      base,
      this.resolveInside(folder, intent.source.path),
      this.resolveInside(folder, intent.entry.path),
      intent,
      apply,
    );
  }

  projectOperation(
    folder: string,
    intent: import('@cruxgarden/local-api').FileProjectionIntent,
    apply: boolean,
    bytes?: Uint8Array,
  ): void {
    if (intent.kind === 'rename') return this.projectRename(folder, intent, apply);
    const relative = intent.kind === 'write' ? intent.entry.path : intent.source.path;
    this.assertNoSymlinks(folder, relative);
    const base = this.assertKnownFolder(folder);
    require('./project-file-operation').projectFileOperation(
      base,
      this.resolveInside(folder, relative),
      intent,
      apply,
      bytes,
    );
  }

  renameFile(folder: string, fromRel: string, toRel: string): void {
    this.assertNoSymlinks(folder, fromRel);
    this.assertNoSymlinks(folder, toRel);
    const from = this.resolveInside(folder, fromRel);
    const to = this.resolveInside(folder, toRel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
  }

  reveal(folder: string, relPath?: string): void {
    const target = relPath ? this.resolveInside(folder, relPath) : this.assertKnownFolder(folder);
    shell.showItemInFolder(target);
  }

  /** Validate a folder for serving/listing. Returns the resolved path. */
  resolveKnownFolder(folder: string): string {
    return this.assertKnownFolder(folder);
  }

  private assertNoSymlinks(folder: string, relPath: string): void {
    let current = this.assertKnownFolder(folder);
    if (fs.lstatSync(current).isSymbolicLink())
      throw new Error('A task cannot use a symlinked Project Folder.');
    for (const part of relPath.split('/')) {
      current = path.join(current, part);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
        throw new Error(`A task cannot capture or replace a symlink: ${relPath}`);
    }
  }

  /**
   * Write many files straight from the Blob Store (content-addressed files under
   * `blobDir`) into a project folder: one IPC call instead of one per file, and
   * no bytes crossing the renderer. Used to prepare Task Working Copies.
   */
  materialize(
    folder: string,
    blobDir: string,
    entries: { path: string; fingerprint: string; mode?: number }[],
  ): number {
    if (!Array.isArray(entries) || entries.length > 20000)
      throw new Error('materialize: choose up to 20,000 entries per call');
    let written = 0;
    for (const entry of entries) {
      if (!/^[a-f0-9]{64}$/.test(entry.fingerprint))
        throw new Error(`materialize: invalid fingerprint for ${entry.path}`);
      const source = path.join(blobDir, entry.fingerprint);
      if (!fs.existsSync(source)) throw new Error(`materialize: missing blob for ${entry.path}`);
      const target = this.resolveInside(folder, entry.path);
      this.assertNoSymlinks(folder, entry.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.crux-write-${require('crypto').randomUUID()}`;
      try {
        // Copy-on-write where the filesystem offers it (APFS, Btrfs, XFS): a
        // 14,000-file tool then costs directory entries, not bytes. Elsewhere
        // this is an ordinary copy.
        fs.copyFileSync(source, temporary, fs.constants.COPYFILE_FICLONE);
        fs.chmodSync(temporary, (entry.mode ?? 0o644) & 0o777);
        fs.renameSync(temporary, target);
        this.noteOwnWrite(target);
        // The bytes are the blob's: a later capture can skip reading them.
        this.rememberContent(folder, entry.path, target, entry.fingerprint);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
      written++;
    }
    return written;
  }

  // ── Content cache ─────────────────────────────────────────────────────────
  // What this process knows about a file's bytes, keyed by the stat signature
  // (inode, size, mtime, ctime) a capture already uses to detect a moving
  // folder. A capture of a 2,000-file tool after a relaunch hashes each file
  // once in this process; every later capture is a stat walk. `utf8` is only
  // known once the bytes were read here.
  private contents = new Map<string, Map<string, ContentNote>>();
  private rememberContent(folder: string, rel: string, abs: string, fingerprint: string): void {
    try {
      const stat = fs.statSync(abs);
      const base = this.assertKnownFolder(folder);
      const notes = this.contents.get(base) ?? new Map<string, ContentNote>();
      if (notes.size > 100000) notes.clear();
      notes.set(rel, {
        signature: statSignature(stat),
        fingerprint,
        size: stat.size,
        utf8: undefined,
      });
      this.contents.set(base, notes);
    } catch {
      /* the file vanished already; a capture reads it afresh */
    }
  }

  /**
   * The Task manifest of a Project Folder without the bytes crossing IPC:
   * every non-ignored file with its fingerprint, size and mode, hashed here
   * and stored in the Blob Store when the store lacks it. `indexedPaths` are
   * the paths the index already holds; those the folder's ignore rules cover
   * are the index's own (a tool runtime, say) and come back as `retained`
   * rather than being read or dropped.
   */
  async captureManifest(
    folder: string,
    blobDir: string,
    indexedPaths: string[],
  ): Promise<{
    files: { path: string; fingerprint: string; size: number; mode: number; utf8: boolean }[];
    retained: string[];
  }> {
    const base = this.assertKnownFolder(folder);
    this.assertNoSymlinks(base, '');
    if (!Array.isArray(indexedPaths) || indexedPaths.length > 200000)
      throw new Error('captureManifest: choose up to 200,000 indexed paths');
    const ig = this.captureIgnores(base);
    const retained = indexedPaths.filter(
      (rel) => typeof rel === 'string' && (ig.ignores(rel) || ig.ignores(rel + '/')),
    );
    const scan = (): { rel: string; abs: string; stat: import('fs').Stats }[] => {
      const result: { rel: string; abs: string; stat: import('fs').Stats }[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          const rel = toPosixRel(base, abs);
          if (isPrivateProjectPath(rel) || ig.ignores(rel) || ig.ignores(rel + '/')) continue;
          if (entry.isSymbolicLink())
            throw new Error(`Task capture does not support symlinks: ${rel}`);
          if (entry.isDirectory()) walk(abs);
          else if (entry.isFile()) result.push({ rel, abs, stat: fs.statSync(abs) });
          else throw new Error(`Task capture does not support this file type: ${rel}`);
        }
      };
      walk(base);
      return result.sort((a, b) => a.rel.localeCompare(b.rel));
    };
    const signatures = (list: ReturnType<typeof scan>) =>
      list.map((f) => `${f.rel}\0${statSignature(f.stat)}`).join('\n');
    const before = scan();
    const { NativeBlobStore } = require('./native-blobs');
    const blobs = new NativeBlobStore(blobDir);
    const notes = this.contents.get(base) ?? new Map<string, ContentNote>();
    this.contents.set(base, notes);
    // One file per turn of the event loop: a long synchronous read-and-hash of
    // a 151 MB folder blocks the main process, and an inspector evaluate that
    // interrupts it can see its promise collected before it settles.
    const files: {
      path: string;
      fingerprint: string;
      size: number;
      mode: number;
      utf8: boolean;
    }[] = [];
    for (const file of before) {
      const signature = statSignature(file.stat);
      let note = notes.get(file.rel);
      if (note && note.signature === signature && blobs.blobExists(note.fingerprint)) {
        if (note.utf8 === undefined) {
          note = { ...note, utf8: isUtf8Bytes(await fs.promises.readFile(file.abs)) };
          notes.set(file.rel, note);
        }
      } else {
        const bytes = await fs.promises.readFile(file.abs);
        const fingerprint = require('crypto').createHash('sha256').update(bytes).digest('hex');
        if (!blobs.blobExists(fingerprint)) blobs.blobWrite(fingerprint, bytes);
        note = { signature, fingerprint, size: bytes.length, utf8: isUtf8Bytes(bytes) };
        notes.set(file.rel, note);
      }
      files.push({
        path: file.rel,
        fingerprint: note.fingerprint,
        size: note.size,
        mode: file.stat.mode & 0o777,
        utf8: note.utf8!,
      });
    }
    if (signatures(before) !== signatures(scan()))
      throw new Error(
        'The Project Folder changed during capture. Pause external writers and try again.',
      );
    return { files, retained };
  }

  /** A file's fingerprint from the content cache when its stat signature still holds, else hashed now. */
  private fingerprintOf(base: string, rel: string): string {
    this.assertNoSymlinks(base, rel);
    const abs = this.resolveInside(base, rel);
    const stat = fs.statSync(abs);
    const signature = statSignature(stat);
    const notes = this.contents.get(base) ?? new Map<string, ContentNote>();
    this.contents.set(base, notes);
    const note = notes.get(rel);
    if (note && note.signature === signature) return note.fingerprint;
    const bytes = fs.readFileSync(abs);
    const fingerprint = require('crypto').createHash('sha256').update(bytes).digest('hex');
    if (notes.size > 100000) notes.clear();
    notes.set(rel, { signature, fingerprint, size: bytes.length, utf8: isUtf8Bytes(bytes) });
    return fingerprint;
  }

  /** Which of these paths the folder's ignore rules cover (a tool's `runtime/`, say). */
  ignoredPaths(folder: string, paths: string[]): string[] {
    const base = this.assertKnownFolder(folder);
    if (!Array.isArray(paths) || paths.length > 200000)
      throw new Error('ignoredPaths: choose up to 200,000 paths');
    const ig = this.captureIgnores(base);
    return paths.filter(
      (rel) =>
        typeof rel === 'string' &&
        !!rel &&
        (isPrivateProjectPath(rel) || ig.ignores(rel) || ig.ignores(rel + '/')),
    );
  }

  /** The rules a Task capture applies: the watcher's defaults, secrets, the folder's `.cruxignore`. */
  private captureIgnores(base: string) {
    const createIgnore = require('ignore');
    const { DEFAULT_IGNORES } = require('./watcher');
    const ig = createIgnore()
      .add(DEFAULT_IGNORES)
      .add([
        '.env',
        '.env.*',
        '*.pem',
        '*.key',
        '.claude/',
        '.codex/',
        '.cursor/',
        '*.crux-write-*',
      ]);
    const ignorePath = path.join(base, '.cruxignore');
    if (fs.existsSync(ignorePath)) {
      this.assertNoSymlinks(base, '.cruxignore');
      ig.add(fs.readFileSync(ignorePath, 'utf8'));
    }
    return ig;
  }

  setMode(folder: string, relPath: string, mode: number): void {
    this.assertNoSymlinks(folder, relPath);
    fs.chmodSync(this.resolveInside(folder, relPath), mode & 0o777);
  }

  capture(folder: string): { path: string; data: Uint8Array; mode: number }[] {
    const base = this.assertKnownFolder(folder);
    this.assertNoSymlinks(base, '');
    const createIgnore = require('ignore');
    const { DEFAULT_IGNORES } = require('./watcher');
    const ig = createIgnore()
      .add(DEFAULT_IGNORES)
      .add([
        '.env',
        '.env.*',
        '*.pem',
        '*.key',
        '.claude/',
        '.codex/',
        '.cursor/',
        '*.crux-write-*',
      ]);
    const ignorePath = path.join(base, '.cruxignore');
    if (fs.existsSync(ignorePath)) {
      this.assertNoSymlinks(base, '.cruxignore');
      ig.add(fs.readFileSync(ignorePath, 'utf8'));
    }
    const scan = (): { rel: string; signature: string; mode: number }[] => {
      const result: { rel: string; signature: string; mode: number }[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const abs = path.join(dir, entry.name);
          const rel = toPosixRel(base, abs);
          if (isPrivateProjectPath(rel) || ig.ignores(rel) || ig.ignores(rel + '/')) continue;
          if (entry.isSymbolicLink())
            throw new Error(`Task capture does not support symlinks: ${rel}`);
          if (entry.isDirectory()) walk(abs);
          else if (entry.isFile()) {
            const stat = fs.statSync(abs);
            result.push({
              rel,
              mode: stat.mode & 0o777,
              signature: `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`,
            });
          } else throw new Error(`Task capture does not support this file type: ${rel}`);
        }
      };
      walk(base);
      return result.sort((a, b) => a.rel.localeCompare(b.rel));
    };
    const before = scan();
    const files = before.map((f) => ({
      path: f.rel,
      mode: f.mode,
      data: this.readFile(base, f.rel),
    }));
    if (JSON.stringify(before) !== JSON.stringify(scan()))
      throw new Error(
        'The Project Folder changed during capture. Pause external writers and try again.',
      );
    return files;
  }

  /**
   * List all non-ignored files in a Project Folder (relative, POSIX-style).
   * Respects DEFAULT_IGNORES + the folder's .cruxignore, like the watcher.
   */
  listFiles(folder: string): string[] {
    const base = this.assertKnownFolder(folder);
    const createIgnore = require('ignore');
    const { DEFAULT_IGNORES } = require('./watcher');
    const ig = createIgnore().add(DEFAULT_IGNORES);
    try {
      ig.add(fs.readFileSync(path.join(base, '.cruxignore'), 'utf8'));
    } catch {
      /* no .cruxignore */
    }

    const out: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = toPosixRel(base, abs);
        if (isPrivateProjectPath(rel) || ig.ignores(entry.isDirectory() ? rel + '/' : rel))
          continue;
        if (entry.isDirectory()) walk(abs);
        else if (entry.isFile()) out.push(rel);
      }
    };
    walk(base);
    return out.sort();
  }

  /** Recover edits made while no watcher was running. Never projects index data onto disk. */
  reconcile(
    folder: string,
    indexed: { path: string; fingerprint: string | null }[],
  ): import('./watcher').WatchBatch {
    const base = this.assertKnownFolder(folder);
    if (!fs.existsSync(base)) return { folder, folderMissing: true, events: [] };
    const { DEFAULT_IGNORES } = require('./folder-scan');
    const ig = require('ignore')().add(DEFAULT_IGNORES);
    try {
      this.assertNoSymlinks(base, '.cruxignore');
      ig.add(fs.readFileSync(path.join(base, '.cruxignore'), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const previous = new Map(indexed.map((entry) => [entry.path, entry.fingerprint]));
    const files = this.listFiles(base);
    const present = new Set(files);
    const events: import('./watcher').WatchEvent[] = [];
    for (const relPath of files) {
      if (previous.get(relPath) !== this.fingerprintOf(base, relPath))
        events.push({ type: 'write', relPath, own: false });
    }
    for (const entry of indexed) {
      const relPath = entry.path;
      // An ignore-rule change is not a file deletion. Neither is a symlink,
      // unreadable path or incomplete scan: only an actual ENOENT permits removal.
      if (present.has(relPath) || ig.ignores(relPath) || ig.ignores(relPath + '/')) continue;
      const target = this.resolveInside(base, relPath);
      this.assertNoSymlinks(base, relPath);
      try {
        fs.lstatSync(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        events.push({ type: 'delete', relPath });
      }
    }
    if (!fs.existsSync(base)) return { folder, folderMissing: true, events: [] };
    return { folder, events };
  }
}
