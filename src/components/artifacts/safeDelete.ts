import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { confirmDialog } from '@/stores/dialogStore';
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
  const ok = await confirmDialog({
    title,
    message: `${question} A snapshot is taken first, so Growth can bring it back.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return false;
  const state = cruxStore.getState();
  const first = state.artifacts.find((a) => a.id === artifactIds[0]);
  const what =
    artifactIds.length === 1 && first ? basename(pathOf(first)) : `${artifactIds.length} files`;
  await state.createSnapshot({ label: `Before deleting ${what}`, silent: true, ifChanged: true });
  await state.deleteArtifacts(artifactIds);
  return true;
}
