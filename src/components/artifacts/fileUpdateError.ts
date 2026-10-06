import type { StoreApi } from 'zustand';
import type { CruxState } from '@/stores/cruxStore';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { pendingFileProjection } from '@/services/file-content';

/** Recovery resumes the admitted operation for its original owner. It never
 * repeats a delete or renews approval to replace a file that changed later. */
export async function reportFileUpdateError(
  store: StoreApi<CruxState>,
  error: unknown,
  options: { title: string; fallback: string; message?: string },
): Promise<void> {
  const message = options.message ?? (error instanceof Error ? error.message : options.fallback);
  const pending = pendingFileProjection(error);
  if (!pending) {
    await alertDialog(message, options.title);
    return;
  }
  let detail = message;
  while (
    await confirmDialog({
      title: 'File update pending',
      message: detail,
      confirmLabel: 'Retry file update',
      cancelLabel: 'Later',
    })
  ) {
    try {
      await store.getState().recoverFileUpdates(pending.ownerId);
      return;
    } catch (failure) {
      detail = `${message}\n\nRecovery could not finish: ${failure instanceof Error ? failure.message : String(failure)}`;
    }
  }
}
