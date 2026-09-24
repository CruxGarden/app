import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { captureEditCheckpoint } from '@/services/edit-history';
import { getSqliteClient } from '@/services/sqlite/client';

/** File deletion keeps a protected Edit history copy on capable connections. */
export async function confirmAndDeleteArtifacts(
  cruxStore: StoreApi<CruxState>,
  artifactIds: string[],
  question: string,
  title?: string,
): Promise<boolean> {
  if (artifactIds.length === 0) return false;
  const ownerId = cruxStore.getState().crux?.id;
  const selection = [...artifactIds];
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
    if (ownerId) await captureEditCheckpoint(ownerId, 'safety');
    if (cruxStore.getState().crux?.id !== ownerId)
      throw new Error('The active Crux changed. Select its files and try again.');
    await state.deleteArtifacts(selection);
    return true;
  } catch (error) {
    await alertDialog(
      error instanceof Error ? error.message : 'Could not delete these files.',
      'Delete failed',
    );
    return false;
  }
}
