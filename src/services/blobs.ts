import { getSqliteClient } from './sqlite/client';
import { hashContent } from './sqlite/helpers';

/**
 * The Blob Store, as one interface (CONTEXT.md): content-addressed bytes
 * keyed by Fingerprint. Callers never hash-then-write or read-then-objectURL
 * by hand — eight places had grown their own copy of those two recipes.
 */

/** Store bytes; returns their Fingerprint (idempotent — same bytes, same key). */
export async function putBlob(data: Uint8Array | Blob | File): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  const fingerprint = await hashContent(bytes);
  await getSqliteClient().blobWrite(fingerprint, bytes);
  return fingerprint;
}

/** Read stored bytes by Fingerprint. */
export function readBlob(fingerprint: string): Promise<Uint8Array> {
  return getSqliteClient().blobRead(fingerprint);
}

/**
 * Object URL for a stored blob. The caller owns the URL and must
 * `URL.revokeObjectURL` it (or use `useBlobUrl`, which does).
 */
export async function blobObjectUrl(fingerprint: string, type?: string): Promise<string> {
  const bytes = await readBlob(fingerprint);
  return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], type ? { type } : undefined));
}
