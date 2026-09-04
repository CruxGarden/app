const path = require('path');

/**
 * Path rules for Project Folders, kept free of Electron imports so they can
 * be unit-tested on any OS. Windows differs in three ways that matter here:
 * backslash separators, case-insensitive drives/folders, and reserved names.
 */

const WIN = process.platform === 'win32';

/** Compare two absolute paths the way the OS does (case-insensitive on Windows). */
function samePath(a: string, b: string): boolean {
  return WIN ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** True when `candidate` is `base` or lives inside it (no traversal, any separator). */
export function isInside(base: string, candidate: string): boolean {
  const b = path.resolve(base);
  const c = path.resolve(candidate);
  if (samePath(b, c)) return true;
  const rel = path.relative(b, c);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return false;
  // path.relative on Windows across drives returns an absolute path — caught above.
  return WIN ? c.toLowerCase().startsWith(b.toLowerCase() + path.sep) : c.startsWith(b + path.sep);
}

/** Resolve `relPath` inside `base` or throw; accepts POSIX or Windows separators. */
export function resolveInsideOrThrow(base: string, relPath: string): string {
  const normalized = relPath.replace(/\\/g, '/');
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized))
    throw new Error(`Path escapes the project folder: ${relPath}`);
  const target = path.resolve(base, ...normalized.split('/'));
  if (!isInside(base, target)) throw new Error(`Path escapes the project folder: ${relPath}`);
  return target;
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Filesystem names a slug may not produce (all platforms). */
export function sanitizeFolderName(slug: string): string {
  let cleaned = slug
    .trim()
    .replace(/[. ]+$/, '') // Windows strips trailing dots/spaces, which would rename the folder
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .slice(0, 100);
  if (WINDOWS_RESERVED.test(cleaned)) cleaned = `${cleaned}-crux`;
  return cleaned || 'crux';
}

/** A relative path in POSIX form for storage and display. */
export function toPosixRel(base: string, abs: string): string {
  return path.relative(base, abs).split(path.sep).join('/');
}
