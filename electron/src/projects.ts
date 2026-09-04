const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  isInside,
  resolveInsideOrThrow,
  sanitizeFolderName: sanitizeName,
  toPosixRel,
} = require('./paths');

/**
 * Project Folders (ADR 0001) — main-process side.
 *
 * The Garden Root (default ~/CruxGarden) holds one real Project Folder per
 * crux. All folder paths handed to file operations are validated to sit under
 * a known garden root, and relative paths are normalized to prevent traversal
 * out of the project folder.
 */

interface DesktopConfigData {
  gardenRoot: string;
  /** Every root ever used — folders under a previous root stay operable. */
  knownRoots: string[];
  /** Check GitHub Releases for updates on launch (ADR 0008: visible, disableable). */
  autoUpdate: boolean;
}

export class DesktopConfig {
  private filePath: string;
  private data: DesktopConfigData | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'desktop-config.json');
  }

  private defaults(): DesktopConfigData {
    // CRUX_GARDEN_ROOT: test isolation — UI tests must not create folders in
    // the developer's real garden.
    const root = process.env.CRUX_GARDEN_ROOT || path.join(os.homedir(), 'CruxGarden');
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
  constructor(private config: DesktopConfig) {}

  ensureGardenRoot(): string {
    const root = this.config.gardenRoot;
    fs.mkdirSync(root, { recursive: true });
    return root;
  }

  /** True when `candidate` is inside (or is) a directory we manage. */
  private isUnderKnownRoot(candidate: string): boolean {
    return this.config.knownRoots.some((root: string) => isInside(root, candidate));
  }

  private assertKnownFolder(folder: string): string {
    const resolved = path.resolve(folder);
    if (!this.isUnderKnownRoot(resolved)) {
      throw new Error(`Path is outside the garden root: ${folder}`);
    }
    return resolved;
  }

  /** Resolve a relative path inside a project folder; reject traversal. */
  private resolveInside(folder: string, relPath: string): string {
    const base = this.assertKnownFolder(folder);
    return resolveInsideOrThrow(base, relPath);
  }

  /** Create a Project Folder for a slug; `-2`, `-3`… on collision. */
  createFolder(slug: string): string {
    const root = this.ensureGardenRoot();
    const base = sanitizeFolderName(slug);
    let name = base;
    let counter = 2;
    while (fs.existsSync(path.join(root, name))) {
      name = `${base}-${counter++}`;
    }
    const folder = path.join(root, name);
    fs.mkdirSync(folder, { recursive: true });
    return folder;
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
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data));
  }

  readFile(folder: string, relPath: string): Uint8Array {
    return new Uint8Array(fs.readFileSync(this.resolveInside(folder, relPath)));
  }

  deleteFile(folder: string, relPath: string): void {
    const target = this.resolveInside(folder, relPath);
    try {
      fs.unlinkSync(target);
    } catch {
      return; // already gone
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

  renameFile(folder: string, fromRel: string, toRel: string): void {
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
        if (ig.ignores(entry.isDirectory() ? rel + '/' : rel)) continue;
        if (entry.isDirectory()) walk(abs);
        else if (entry.isFile()) out.push(rel);
      }
    };
    walk(base);
    return out.sort();
  }
}
