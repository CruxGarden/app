/**
 * Looking at a folder before taking it in.
 *
 * A Crux is normally an empty folder the app made. Bringing in one that
 * already exists — a checkout you are working on — is a different act, and it
 * deserves to be looked at first: a repository is mostly things that are not
 * its source, and importing them would be slow, enormous and wrong.
 *
 * So this walks the folder and reports what it would take and what it would
 * leave, and the caller decides. Nothing here changes anything on disk.
 *
 * What is left out, in order:
 *
 *   1. `DEFAULT_IGNORES` — `node_modules/`, `dist/`, `.git/` and the rest.
 *      These are never negotiable: a `.gitignore` that un-ignored them would
 *      be doing something strange, and a folder is not worth that surprise.
 *   2. every `.gitignore` in the tree, applied to its own directory and below,
 *      the way git applies them. A repository has already said what is not its
 *      source, and it is usually right.
 *   3. the folder's own `.cruxignore`, which is this Crux's word, last.
 */
import * as fs from 'fs';
import * as path from 'path';
const createIgnore = require('ignore');

/**
 * What is never taken in, whatever a folder says.
 *
 * The watcher applies the same list, so a file that could not be ingested by
 * one path cannot arrive by the other.
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
  '*.crux-write-*',
];

/** A file big enough that someone should know about it before it is taken in. */
export const LARGE_FILE_BYTES = 10 * 1024 * 1024;

export interface FolderScan {
  /** Files that would be taken in, POSIX-relative, sorted. */
  files: string[];
  bytes: number;
  /** How many were left out, and how much they came to. */
  ignored: number;
  ignoredBytes: number;
  /** The biggest few that would come in, so a surprise is visible. */
  large: { path: string; bytes: number }[];
  /** Where the rules came from: `.gitignore` paths found, and whether a `.cruxignore` was read. */
  gitignores: string[];
  cruxignore: boolean;
  /** True when the walk stopped early; the counts are then a floor, not a total. */
  truncated: boolean;
}

interface Layer {
  /** Directory the rules apply to, POSIX-relative to the root ('' for the root). */
  base: string;
  matcher: { ignores(p: string): boolean };
}

function layerFor(base: string, patterns: string[]): Layer {
  return { base, matcher: createIgnore().add(patterns) };
}

/** Whether any layer covering this path ignores it. */
function ignored(layers: Layer[], rel: string, isDir: boolean): boolean {
  for (const layer of layers) {
    if (layer.base && !rel.startsWith(`${layer.base}/`)) continue;
    const within = layer.base ? rel.slice(layer.base.length + 1) : rel;
    if (!within) continue;
    // A directory-only pattern (`dist/`) needs the trailing slash to match.
    if (layer.matcher.ignores(within) || (isDir && layer.matcher.ignores(`${within}/`)))
      return true;
  }
  return false;
}

function read(at: string): string[] {
  try {
    return fs.readFileSync(at, 'utf8').split('\n');
  } catch {
    return [];
  }
}

/**
 * Walk a folder and report what taking it in would mean.
 *
 * `maxFiles` bounds the work: a wrong folder (a home directory, a disk) must
 * answer quickly rather than being counted to the end.
 */
export function scanFolder(folder: string, opts: { maxFiles?: number } = {}): FolderScan {
  const root = path.resolve(folder);
  const maxFiles = opts.maxFiles ?? 20_000;
  const scan: FolderScan = {
    files: [],
    bytes: 0,
    ignored: 0,
    ignoredBytes: 0,
    large: [],
    gitignores: [],
    cruxignore: false,
    truncated: false,
  };
  if (!fs.existsSync(root)) return scan;

  // The floor, then this Crux's own word. A `.gitignore` joins as it is met.
  const layers: Layer[] = [layerFor('', DEFAULT_IGNORES)];
  const cruxignore = path.join(root, '.cruxignore');
  if (fs.existsSync(cruxignore)) {
    scan.cruxignore = true;
    layers.push(layerFor('', read(cruxignore)));
  }

  let seen = 0;
  const walk = (dir: string, base: string, inherited: Layer[]) => {
    if (scan.truncated) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // an unreadable directory is not an error worth stopping for
    }

    // A .gitignore applies to its own directory and everything below it.
    let here = inherited;
    if (entries.some((e) => e.isFile() && e.name === '.gitignore')) {
      const rel = base ? `${base}/.gitignore` : '.gitignore';
      scan.gitignores.push(rel);
      here = [...inherited, layerFor(base, read(path.join(dir, '.gitignore')))];
    }

    for (const entry of entries) {
      if (scan.truncated) return;
      const rel = base ? `${base}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      // A symlink is followed for neither its size nor its contents: a link
      // out of the folder is exactly what should not be taken in.
      if (entry.isSymbolicLink()) {
        scan.ignored++;
        continue;
      }
      if (entry.isDirectory()) {
        if (ignored(here, rel, true)) {
          const inside = countQuietly(full);
          scan.ignored += inside.files;
          scan.ignoredBytes += inside.bytes;
          continue;
        }
        walk(full, rel, here);
        continue;
      }
      if (!entry.isFile()) continue;
      let size: number;
      try {
        size = fs.statSync(full).size;
      } catch {
        continue;
      }
      if (ignored(here, rel, false)) {
        scan.ignored++;
        scan.ignoredBytes += size;
        continue;
      }
      if (++seen > maxFiles) {
        scan.truncated = true;
        return;
      }
      scan.files.push(rel);
      scan.bytes += size;
      if (size >= LARGE_FILE_BYTES) scan.large.push({ path: rel, bytes: size });
    }
  };

  walk(root, '', layers);
  scan.files.sort();
  scan.large.sort((a, b) => b.bytes - a.bytes);
  scan.large = scan.large.slice(0, 10);
  return scan;
}

/** How much is in a directory that is being left out — counted, not listed. */
function countQuietly(dir: string, depth = 0): { files: number; bytes: number } {
  const out = { files: 0, bytes: 0 };
  if (depth > 12) return out;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const inside = countQuietly(full, depth + 1);
      out.files += inside.files;
      out.bytes += inside.bytes;
    } else if (entry.isFile()) {
      out.files++;
      try {
        out.bytes += fs.statSync(full).size;
      } catch {
        /* gone between reading and asking */
      }
    }
  }
  return out;
}
