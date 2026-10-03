import type { SqliteBridge } from '@/lib/platform';
import { getSqliteClient } from './sqlite/client';

type Content = NonNullable<SqliteBridge['fileContent']>;
export type FileReference = Parameters<Content['read']>[0];
export type SelectedFiles = Awaited<ReturnType<Content['list']>>;

/** A content head committed, but its admitted filesystem operation is unfinished. */
export class FileProjectionPendingError extends Error {
  readonly ownerId: string;
  readonly paths: readonly string[];
  constructor(ownerId: string, paths: readonly string[], cause: unknown) {
    super(
      `Your file update is saved in Garden, but the Project Folder update is unfinished. Retry file update to continue. ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = 'FileProjectionPendingError';
    this.ownerId = ownerId;
    this.paths = [...paths];
  }
}

export function pendingFileProjection(error: unknown): FileProjectionPendingError | undefined {
  if (error instanceof FileProjectionPendingError) return error;
  if (error instanceof AggregateError)
    for (const nested of error.errors) {
      const pending = pendingFileProjection(nested);
      if (pending) return pending;
    }
  return undefined;
}

/** Wrap only the filesystem step after a command returned its committed head. */
export async function finishFileProjection(
  ownerId: string,
  paths: readonly string[],
  finish?: Content['finishProjection'],
): Promise<boolean> {
  const apply = finish ?? getSqliteClient().fileContent?.finishProjection;
  if (!apply) throw new Error('File recovery is unavailable.');
  const capturedPaths = [...paths];
  try {
    return await apply(ownerId);
  } catch (error) {
    throw new FileProjectionPendingError(ownerId, capturedPaths, error);
  }
}

/** Resume the captured owner's existing intent; never submit a replacement mutation.
 * Reconcile after completion because watcher events may have met the pending fence. */
export async function recoverPendingFileUpdates(
  ownerId: string,
  reconcile = false,
): Promise<boolean> {
  const db = getSqliteClient();
  const ingestion = await import('./ingestion');
  let pending = false;
  await ingestion.serializeIngestion(async () => {
    pending = !!(await db.get('SELECT key FROM settings WHERE key = ?', [
      `cruxgarden:content-projection:${ownerId}`,
    ]));
    if (pending) await finishFileProjection(ownerId, [], db.fileContent?.finishProjection);
  });
  if (getSqliteClient() !== db) throw new Error('The Garden changed during file recovery.');
  if (pending || reconcile) await ingestion.recoverProjectFolders([ownerId]);
  return pending;
}

/** Finish previously committed filesystem work before ingestion or portable export. */
export async function finishPendingContentProjections(owners?: readonly string[]): Promise<void> {
  const db = getSqliteClient();
  if (!db.fileContent) return;
  const prefix = 'cruxgarden:content-projection:';
  const pending = await db.all<{ key: string }>('SELECT key FROM settings WHERE key LIKE ?', [
    `${prefix}%`,
  ]);
  for (const item of pending) {
    const id = item.key.slice(prefix.length);
    if (!owners || owners.includes(id)) await db.fileContent.finishProjection(id);
  }
}

/** Capture an actual API-owned file version. Consumers use its head for every
 * subsequent read/edit; they never parse manifests or resolve an ID-only file.
 * Null means this connection or content owner has no committed head yet.
 * This is an adoption boundary, not an old-format import/conversion path. */
export async function selectCruxFiles(cruxId: string): Promise<SelectedFiles | null> {
  const db = getSqliteClient();
  const content = db.fileContent;
  if (!content) return null;
  // Working Copies keep their own identity and content head in the same API.
  if (
    !(await db.get(
      'SELECT id FROM cruxes WHERE id = ? UNION ALL SELECT id FROM working_copies WHERE id = ?',
      [cruxId, cruxId],
    ))
  )
    return null;
  const head = await content.head(cruxId);
  return head ? content.list({ cruxId, expected: head }) : null;
}

/** A reference always names its owner and selected version. A missing/stale
 * file is an error, never a request to read the latest file with the same ID. */
export async function readSelectedFile(reference: FileReference) {
  const content = getSqliteClient().fileContent;
  if (!content) throw new Error('This connection does not support versioned files.');
  const captured = {
    cruxId: reference.cruxId,
    expected: { ...reference.expected },
    path: reference.path,
  };
  const result = await content.read(captured);
  if (!result) throw new Error('This file is missing from the selected version.');
  return result;
}
