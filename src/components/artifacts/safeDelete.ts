import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { confirmDialog } from '@/stores/dialogStore';
import { getSqliteClient } from '@/services/sqlite/client';
import { reportFileUpdateError } from './fileUpdateError';

/** File deletion keeps a protected Edit history copy on capable connections. */
export async function confirmAndDeleteArtifacts(
  cruxStore: StoreApi<CruxState>,
  artifactIds: string[],
  question: string,
  title?: string,
): Promise<boolean> {
  if (artifactIds.length === 0) return false;
  const ownerId = cruxStore.getState().crux?.id;
  const selection = structuredClone(
    cruxStore.getState().artifacts.filter((file) => artifactIds.includes(file.id)),
  );
  const ids = [...artifactIds];
  const ok = await confirmDialog({
    title,
    message: getSqliteClient().fileContent
      ? `${question} A safety copy is kept in Edit history.`
      : question,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  try {
    const state = cruxStore.getState();
    if (state.crux?.id !== ownerId || state.viewingSnapshotId)
      throw new Error('Return to the current files in this Crux before deleting them.');
    await state.deleteArtifacts(ids, selection);
    return true;
  } catch (error) {
    await reportFileUpdateError(cruxStore, error, {
      title: 'Delete failed',
      fallback: 'Could not delete these files.',
    });
    return false;
  }
}
