import { create } from 'zustand';
import * as syncApi from '@/api/sync';
import { assertAuthCurrent, captureAuth, type AuthContext } from '@/api/session';
import { importCrux, peekImport } from './crux-io';
import { settleIngestion } from './ingestion';
import { contentRevision, type BackupRecord } from './backup';
import {
  activateWorkspace,
  closeCruxWorkspaces,
  getWorkspace,
  openWorkspace,
  useWorkspaceRegistry,
} from '@/stores/workspaceRegistry';

interface PullState {
  busy: boolean;
  message: string;
  error: string;
}
export const IDLE_PULL: PullState = { busy: false, message: '', error: '' };
// A pull outlives the workspace it replaces, so its feedback must too.
export const useSyncPull = create<Record<string, PullState>>(() => ({}));

export async function pullCrux(
  cruxId: string,
  context: AuthContext = captureAuth(),
): Promise<void> {
  if (useSyncPull.getState()[cruxId]?.busy) return;
  const report = (state: PullState) => useSyncPull.setState({ [cruxId]: state });
  report({ busy: true, message: 'Downloading from cloud...', error: '' });
  let reopen = false;
  let restoreActive = false;
  let error = '';
  try {
    assertAuthCurrent(context);
    const blob = await syncApi.pullCrux(cruxId, context);
    const { cruxData } = await peekImport(blob);
    assertAuthCurrent(context);
    if (cruxData.id !== cruxId) throw new Error('The cloud copy belongs to a different Crux.');
    reopen = !!getWorkspace(cruxId);
    restoreActive = useWorkspaceRegistry.getState().activeId === cruxId;
    // Save buffers before the importer's safety backup; stop writers before replacement.
    await closeCruxWorkspaces(cruxId, 'save');
    await settleIngestion();
    assertAuthCurrent(context);
    report({ busy: true, message: 'Importing crux...', error: '' });
    await importCrux({
      data: blob,
      mode: 'replace',
      beforeCommit: () => assertAuthCurrent(context),
    });
    assertAuthCurrent(context);
    await recordPulledCopy(cruxId, context);
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    error = status === 404 ? 'No cloud version found for this crux' : 'Pull failed';
    try {
      assertAuthCurrent(context);
    } catch (changed) {
      error = (changed as Error).message;
    }
    console.error('Crux pull failed:', err);
  } finally {
    if (reopen) {
      try {
        await openWorkspace(cruxId);
        if (restoreActive && useWorkspaceRegistry.getState().activeId === null)
          await activateWorkspace(cruxId);
      } catch (err) {
        console.error('Could not reopen pulled Crux:', err);
        error = 'Could not reopen this Crux. Return to your garden and try opening it again.';
      }
    }
    report({ busy: false, message: error ? '' : 'Pull complete', error });
  }
}

/**
 * After a pull this machine holds exactly the cloud copy, so that copy is its
 * backup: the record says so, or the Sync pane would keep calling the cloud
 * copy "never pushed from this machine" and warn about drift that is not there.
 */
async function recordPulledCopy(cruxId: string, context: AuthContext): Promise<void> {
  try {
    const { getServices } = await import('./index');
    const entry = (await syncApi.listSyncedCruxes(context)).find((c) => c.cruxId === cruxId);
    if (!entry) return;
    const crux = await getServices().crux.findById(cruxId);
    const revision = await contentRevision(cruxId);
    assertAuthCurrent(context);
    const record: BackupRecord = {
      at: entry.updatedAt,
      growthCount: (crux.meta?.growthCount as number | undefined) ?? 0,
      size: entry.size,
      ...(revision !== undefined ? { contentRevision: revision } : {}),
    };
    await getServices().crux.update(cruxId, { meta: { ...crux.meta, backup: record } });
    assertAuthCurrent(context);
  } catch (err) {
    assertAuthCurrent(context);
    // The pull itself succeeded; a missing record only costs a cautious note.
    console.warn('Could not record the pulled copy as this machine’s backup:', err);
  }
}
