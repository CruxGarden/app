import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { basename, pathOf } from '@/lib/artifact-path';

/**
 * Guardrail: every artifact delete the UI offers goes through here. Confirms,
 * then snapshots the state just before the delete — labelled, silent, and free
 * when the Growth tip already holds it — so Growth can always bring it back.
 */
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
    message: `${question} A snapshot is taken first, so Growth can bring it back.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  try {
    const state = cruxStore.getState();
    if (state.crux?.id !== ownerId || state.viewingSnapshotId)
      throw new Error('Return to the current files in this Crux before deleting them.');
    const first = state.artifacts.find((a) => a.id === selection[0]);
    const what =
      selection.length === 1 && first ? basename(pathOf(first)) : `${selection.length} files`;
    await state.createSnapshot({ label: `Before deleting ${what}`, silent: true, ifChanged: true });
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
