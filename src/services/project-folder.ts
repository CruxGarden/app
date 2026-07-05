/**
 * Project Folder service (ADR 0001) — renderer side.
 *
 * On Desktop, every crux has a real folder under the Garden Root holding its
 * current artifacts as ordinary files. App writes flow through to the folder
 * immediately (write-through); the blob store + SQLite remain the system of
 * record for history. On Web every function is a silent no-op, so callers
 * never branch on platform.
 *
 * The folder's absolute path is stamped on the crux as meta.projectFolder.
 */

import { Capability, can } from '@/lib/platform';
import { getSqliteClient } from './sqlite/client';
import type { Artifact } from '@/api/types';

interface ProjectBridge {
  createFolder(slug: string): Promise<string>;
  ensureFolder(folder: string): Promise<string>;
  folderExists(folder: string): Promise<boolean>;
  writeFile(folder: string, relPath: string, data: Uint8Array): Promise<void>;
  readFile(folder: string, relPath: string): Promise<Uint8Array>;
  deleteFile(folder: string, relPath: string): Promise<void>;
  renameFile(folder: string, fromRel: string, toRel: string): Promise<void>;
  reveal(folder: string, relPath?: string): Promise<void>;
  listFiles(folder: string): Promise<string[]>;
}

function projectBridge(): ProjectBridge | null {
  if (!can(Capability.ProjectFolder)) return null;
  return (window as unknown as { electronAPI: { project: ProjectBridge } }).electronAPI.project;
}

/**
 * Ingestion suppression: when the ingestion service records an EXTERNAL edit
 * through the artifact service, the content is already on disk — write-through
 * would be a pointless echo. Suppression is per (crux, path) so a concurrent
 * app write to a different file is unaffected.
 */
const suppressedPaths = new Set<string>();

export async function withPathSuppressed<T>(
  cruxId: string,
  relPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = `${cruxId}::${relPath}`;
  suppressedPaths.add(key);
  try {
    return await fn();
  } finally {
    suppressedPaths.delete(key);
  }
}

function isSuppressed(cruxId: string, relPath: string): boolean {
  return suppressedPaths.has(`${cruxId}::${relPath}`);
}

/** The artifact's path inside the Project Folder. */
export function artifactRelPath(artifact: Pick<Artifact, 'filename' | 'meta'>): string {
  return (artifact.meta?.path as string | undefined) || artifact.filename;
}

/** Create the folder for a new crux. Returns its absolute path (null on web). */
export async function createProjectFolder(slug: string): Promise<string | null> {
  const api = projectBridge();
  if (!api) return null;
  return api.createFolder(slug || 'crux');
}

/** Look up a crux's registered folder path from its meta. */
export async function folderForCrux(cruxId: string): Promise<string | null> {
  const api = projectBridge();
  if (!api) return null;
  const db = getSqliteClient();
  const row = await db.get<{ meta: string | null }>('SELECT meta FROM cruxes WHERE id = ?', [
    cruxId,
  ]);
  if (!row?.meta) return null;
  try {
    const meta = JSON.parse(row.meta);
    return typeof meta.projectFolder === 'string' ? meta.projectFolder : null;
  } catch {
    return null;
  }
}

async function withFolder(
  cruxId: string,
  op: (api: ProjectBridge, folder: string) => Promise<void>,
): Promise<void> {
  const api = projectBridge();
  if (!api) return;
  const folder = await folderForCrux(cruxId);
  if (!folder) return; // crux predates folders, or imported without one
  try {
    await api.ensureFolder(folder);
    await op(api, folder);
  } catch (err) {
    // Write-through must never take down the canonical write path
    console.error('[project-folder] write-through failed:', err);
  }
}

/** Write an artifact's content into the crux's Project Folder. */
export async function writeThroughArtifact(
  cruxId: string,
  artifact: Pick<Artifact, 'filename' | 'meta'>,
  content: Uint8Array,
): Promise<void> {
  const relPath = artifactRelPath(artifact);
  if (isSuppressed(cruxId, relPath)) return;
  await withFolder(cruxId, (api, folder) => api.writeFile(folder, relPath, content));
}

/** Remove an artifact's file from the crux's Project Folder. */
export async function deleteThroughArtifact(
  cruxId: string,
  artifact: Pick<Artifact, 'filename' | 'meta'>,
): Promise<void> {
  const relPath = artifactRelPath(artifact);
  if (isSuppressed(cruxId, relPath)) return;
  await withFolder(cruxId, (api, folder) => api.deleteFile(folder, relPath));
}

/** Rename/move an artifact's file inside the crux's Project Folder. */
export async function renameThroughArtifact(
  cruxId: string,
  fromRel: string,
  toRel: string,
): Promise<void> {
  if (fromRel === toRel) return;
  await withFolder(cruxId, (api, folder) => api.renameFile(folder, fromRel, toRel));
}

/** Reveal the crux's folder (or one file in it) in Finder. */
export async function revealProjectFolder(cruxId: string, relPath?: string): Promise<void> {
  const api = projectBridge();
  if (!api) return;
  const folder = await folderForCrux(cruxId);
  if (folder) await api.reveal(folder, relPath);
}

/** Whether the crux's registered Project Folder currently exists on disk. */
export async function projectFolderExists(cruxId: string): Promise<boolean | null> {
  const api = projectBridge();
  if (!api) return null; // web — the question doesn't apply
  const folder = await folderForCrux(cruxId);
  if (!folder) return null;
  return api.folderExists(folder);
}

/**
 * Project the crux's CURRENT artifacts into its folder — the ADR 0001
 * "explicit user-invoked projection" (store → disk). Recreates the folder if
 * missing, writes every artifact, and removes non-ignored stray files so the
 * folder exactly matches the store. Returns the folder path (null on web).
 */
export async function projectAllArtifacts(cruxId: string): Promise<string | null> {
  const api = projectBridge();
  if (!api) return null;
  const folder = await folderForCrux(cruxId);
  if (!folder) return null;

  await api.ensureFolder(folder);
  const db = getSqliteClient();
  const rows = await db.all<{ path: string | null; filename: string; fingerprint: string | null }>(
    "SELECT path, filename, fingerprint FROM artifacts WHERE resource_id = ? AND type = 'artifact'",
    [cruxId],
  );

  const wanted = new Set<string>();
  for (const row of rows) {
    const relPath = row.path || row.filename;
    if (!relPath || !row.fingerprint) continue;
    wanted.add(relPath);
    const bytes = await db.blobRead(row.fingerprint);
    await api.writeFile(folder, relPath, bytes);
  }

  // Remove non-ignored files the store doesn't know — this is an explicit
  // projection, so the store is authoritative for exactly this one moment.
  const onDisk = await api.listFiles(folder);
  for (const relPath of onDisk) {
    if (!wanted.has(relPath)) await api.deleteFile(folder, relPath);
  }

  return folder;
}
