const path = require('path');
const fs = require('fs');

/**
 * Path rules for Project Folders, kept free of Electron imports so they can
 * be unit-tested on any OS. Two things bite here:
 *  - Case: NTFS and (by default) APFS are case-insensitive, so containment is
 *    compared case-folded on Windows and macOS; Linux stays case-sensitive.
 *  - Symlinks: a link inside a Project Folder can point anywhere, so both sides
 *    are compared after resolving the longest prefix that exists on disk.
 * Windows additionally has backslash separators and reserved device names.
 */

const WIN = process.platform === 'win32';
const CASE_INSENSITIVE = WIN || process.platform === 'darwin';

function fold(p: string): string {
  return CASE_INSENSITIVE ? p.toLowerCase() : p;
}

/**
 * Real path of `p` with symlinks resolved. When `p` (or part of it) does not
 * exist yet — a file about to be written — the longest existing prefix is
 * resolved and the missing tail appended unchanged.
 */
export function realpathLongestPrefix(p: string): string {
  let existing = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(existing), ...tail);
    } catch {
      const parent = path.dirname(existing);
      if (parent === existing) return path.resolve(p); // hit the root and nothing exists
      tail.unshift(path.basename(existing));
      existing = parent;
    }
  }
}

/** Compare two absolute paths the way the OS does (case-insensitive on Windows and macOS). */
function samePath(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/**
 * True when `candidate` is `base` or lives inside it — no traversal, any
 * separator, and no symlink that leaves `base` on disk.
 */
export function isInside(base: string, candidate: string): boolean {
  const b = realpathLongestPrefix(base);
  const c = realpathLongestPrefix(candidate);
  if (samePath(b, c)) return true;
  const rel = path.relative(fold(b), fold(c));
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return false;
  // path.relative on Windows across drives returns an absolute path — caught above.
  return fold(c).startsWith(fold(b) + path.sep);
}

/**
 * Device names Windows reserves regardless of extension (`NUL.md` is still NUL).
 * Checked on every platform: a Project Folder may be synced to or cloned on Windows.
 */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Why a single path segment is unusable, or null when it is fine. */
export function invalidSegmentReason(segment: string): string | null {
  if (segment === '' || segment === '.' || segment === '..') return null; // handled by resolve/isInside
  if (WINDOWS_RESERVED.test(segment)) return 'reserved name';
  if (/[. ]$/.test(segment)) return 'trailing dot or space';
  if (/[<>:"|?*]/.test(segment)) return 'forbidden character';
  for (const ch of segment) if (ch.charCodeAt(0) < 0x20) return 'forbidden character';
  return null;
}

/**
 * Resolve `relPath` inside `base` or throw; accepts POSIX or Windows separators.
 * Every segment must also be a legal file name on Windows (see invalidSegmentReason).
 */
export function resolveInsideOrThrow(base: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized))
    throw new Error(`Path escapes the project folder: ${relPath}`);
  const segments = normalized.split('/');
  for (const segment of segments) {
    const reason = invalidSegmentReason(segment);
    if (reason) throw new Error(`Invalid path segment "${segment}" (${reason}): ${relPath}`);
  }
  const target = path.resolve(base, ...segments);
  if (!isInside(base, target)) throw new Error(`Path escapes the project folder: ${relPath}`);
  return target;
}

/** Filesystem names a slug may not produce (all platforms). */
export function sanitizeFolderName(slug: string): string {
  let cleaned = slug
    .trim()
    .replace(/[. ]+$/, '') // Windows strips trailing dots/spaces, which would rename the folder
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '')
    .replace(/[.-]+$/, '') // `My Blog!` → `My-Blog`, not `My-Blog-`
    .slice(0, 100)
    .replace(/[.-]+$/, ''); // the cut may end on a dash or dot again
  if (WINDOWS_RESERVED.test(cleaned)) cleaned = `${cleaned}-crux`;
  return cleaned || 'crux';
}

/** A relative path in POSIX form for storage and display. */
export function toPosixRel(base: string, abs: string): string {
  return path.relative(base, abs).split(path.sep).join('/');
}
