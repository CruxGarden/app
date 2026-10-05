import type { Artifact } from '@/api/types';
import { isWorkspaceThumbnail, pathOf } from '@/lib/artifact-path';
import { isBinaryMime } from '@/lib/mime';
import { readBlob } from './blobs';

/**
 * Compare a saved state (a Growth version, an Edit history recovery point)
 * with the files as they are now. Everything here only reads: the two file
 * lists are compared by Fingerprint, and content is fetched from the Blob
 * Store by Fingerprint when one changed file is opened. No version is created
 * and no history is touched to compute a diff.
 */
export interface CompareFile {
  path: string;
  fingerprint?: string;
  size: number;
  mimeType: string;
  encoding: string;
}

export type FileChangeStatus = 'changed' | 'added' | 'removed';

export interface FileChange {
  path: string;
  status: FileChangeStatus;
  /** The file in the saved state; absent when it was added since. */
  before?: CompareFile;
  /** The file as it is now; absent when it was removed since. */
  after?: CompareFile;
}

/** Text beyond this is not diffed; the view says so plainly. */
export const TEXT_DIFF_LIMIT = 1024 * 1024;

/** The Home thumbnail is recaptured on its own; it is never a person's change. */
const compared = (files: readonly CompareFile[]) =>
  files.filter((file) => file.path && !isWorkspaceThumbnail(file.path));

/**
 * What differs between `before` (the saved state) and `after` (now), by path:
 * added, removed, or changed (a different Fingerprint). Sorted by path.
 */
export function compareFileLists(
  before: readonly CompareFile[],
  after: readonly CompareFile[],
): FileChange[] {
  const then = new Map(compared(before).map((file) => [file.path, file]));
  const now = new Map(compared(after).map((file) => [file.path, file]));
  const changes: FileChange[] = [];
  for (const [path, file] of then) {
    const current = now.get(path);
    if (!current) changes.push({ path, status: 'removed', before: file });
    else if (!file.fingerprint || file.fingerprint !== current.fingerprint)
      changes.push({ path, status: 'changed', before: file, after: current });
  }
  for (const [path, file] of now)
    if (!then.has(path)) changes.push({ path, status: 'added', after: file });
  return changes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function countChanges(changes: readonly FileChange[]): Record<FileChangeStatus, number> {
  const counts = { changed: 0, added: 0, removed: 0 };
  for (const change of changes) counts[change.status]++;
  return counts;
}

export type ChangeView = 'text' | 'image' | 'binary' | 'too-large';

const isImage = (file: CompareFile) =>
  (file.mimeType || '').startsWith('image/') && file.mimeType !== 'image/svg+xml';
const isText = (file: CompareFile) =>
  file.encoding !== 'binary' && !isBinaryMime(file.mimeType || '');

/** How one change is shown: a text diff, before/after pictures, or just the fact. */
export function changeView(change: FileChange): ChangeView {
  const sides = [change.before, change.after].filter((file): file is CompareFile => !!file);
  if (sides.every(isImage)) return 'image';
  if (!sides.every(isText)) return 'binary';
  if (sides.some((file) => file.size > TEXT_DIFF_LIMIT)) return 'too-large';
  return 'text';
}

export function compareFilesOf(artifacts: readonly Artifact[]): CompareFile[] {
  return artifacts
    .filter((artifact) => artifact.type === 'artifact')
    .map((artifact) => ({
      path: pathOf(artifact),
      fingerprint: artifact.fingerprint,
      size: Number(artifact.size) || 0,
      mimeType: artifact.mimeType,
      encoding: artifact.encoding,
    }));
}

export async function readCompareBytes(file: CompareFile): Promise<Uint8Array> {
  if (!file.fingerprint) throw new Error('This file has no saved content to compare.');
  return readBlob(file.fingerprint);
}

/** One side of a text diff; a missing side (added or removed) reads as empty. */
export async function readCompareText(file: CompareFile | undefined): Promise<string> {
  if (!file) return '';
  return new TextDecoder().decode(await readCompareBytes(file));
}
