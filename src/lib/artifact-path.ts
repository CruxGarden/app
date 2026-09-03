/**
 * The one place the "where does this Artifact live" rule exists.
 *
 * An Artifact's path is `meta.path` when present, else its filename. Previously
 * this rule was inlined ~43 times with four different fallbacks ('' / id /
 * 'file' / 'media') — every helper here exists to make that impossible again.
 */

export interface ArtifactPathSource {
  meta?: { path?: string } | null;
  filename?: string;
}

/** Canonical relative path of an Artifact ('' when it has neither source). */
export function pathOf(artifact: ArtifactPathSource): string {
  return artifact.meta?.path || artifact.filename || '';
}

/** Last path segment ('' stays ''). */
export function basename(path: string): string {
  return path.split('/').pop() || path;
}

/** Display name for UI: basename of the canonical path, never empty. */
export function displayNameOf(artifact: ArtifactPathSource, fallback = 'file'): string {
  return basename(pathOf(artifact)) || fallback;
}

/** Lowercased extension without the dot ('' when none). */
export function extensionOf(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx + 1).toLowerCase() : '';
}

/** Parent directory path ('' at root). */
export function parentPath(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

/** True when `path` is `folder` itself or any descendant of it. */
export function isUnder(folder: string, path: string): boolean {
  return path === folder || path.startsWith(folder + '/');
}

/**
 * The workspace thumbnail: app state that happens to be stored as an artifact.
 *
 * It is not one of the user's files — it must not reach the Project Folder,
 * the published site, or publish change detection (its JPEG bytes differ on
 * every capture, which would leave the crux permanently "changed").
 */
export const WORKSPACE_THUMBNAIL_PATH = 'preview.jpg';

export function isWorkspaceThumbnail(path: string): boolean {
  return path.toLowerCase() === WORKSPACE_THUMBNAIL_PATH;
}

/**
 * Resolve `.` / `..` segments and collapse empty ones: 'a/./b/../c' → 'a/c'.
 * Clamps at the root — a path can never climb above the crux.
 */
export function resolveRelativePath(path: string): string {
  const resolved: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') resolved.pop();
    else resolved.push(part);
  }
  return resolved.join('/');
}

/** Strip a single leading slash (tool inputs and legacy paths carry them). */
export function normalizePath(path: string): string {
  return path.replace(/^\//, '');
}
