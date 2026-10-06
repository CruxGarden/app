import type { Artifact } from '@/api/types';
import { getSqliteClient } from './sqlite/client';

/** Publication owns the selected file bytes. A sibling save may move the head;
 * reselect only the same file identity, content and publishing attributes.
 * Ordinary editor reads remain strict, and no latest-file substitution occurs. */
export async function downloadPublicationBlob(file: Artifact): Promise<Blob> {
  const content = getSqliteClient().fileContent;
  const selected = structuredClone(file);
  const reference = selected.fileReference;
  if (!content || !reference || reference.cruxId !== selected.resourceId)
    throw new Error('Select the file in its Crux before sharing it.');

  let result: Awaited<ReturnType<typeof content.read>>;
  try {
    result = await content.read(reference);
  } catch (error) {
    const head = await content.head(reference.cruxId);
    if (
      !head ||
      (head.root === reference.expected.root && head.revision === reference.expected.revision)
    )
      throw error;
    result = await content.read({
      ...reference,
      expected: { root: head.root, revision: head.revision },
    });
  }
  if (
    !result ||
    result.entry.id !== selected.id ||
    result.entry.path !== reference.path ||
    result.entry.fingerprint !== selected.fingerprint ||
    result.entry.mode !== Number(selected.meta?.mode ?? 0o644) ||
    result.entry.mimeType !== selected.mimeType ||
    result.entry.encoding !== selected.encoding
  )
    throw new Error('This file changed while preparing to share. Review it and share again.');
  return new Blob([new Uint8Array(result.bytes)], { type: result.entry.mimeType });
}
