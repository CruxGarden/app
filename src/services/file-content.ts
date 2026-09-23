import type { SqliteBridge } from '@/lib/platform';
import { getSqliteClient } from './sqlite/client';

type Content = NonNullable<SqliteBridge['fileContent']>;
export type FileReference = Parameters<Content['read']>[0];
export type SelectedFiles = Awaited<ReturnType<Content['list']>>;

/** Capture an actual API-owned file version. Consumers use its head for every
 * subsequent read/edit; they never parse manifests or resolve an ID-only file.
 * Null means this caller has not adopted manifest content yet (including Tasks).
 * This is an adoption boundary, not an old-format import/conversion path. */
export async function selectCruxFiles(cruxId: string): Promise<SelectedFiles | null> {
  const db = getSqliteClient();
  const content = db.fileContent;
  if (!content) return null;
  // Working Copies currently have a separate identity space; they are not yet
  // supported by the API file writer and must not masquerade as Crux records.
  if (!(await db.get('SELECT id FROM cruxes WHERE id = ?', [cruxId]))) return null;
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
