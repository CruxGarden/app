import { create } from 'zustand';
import * as syncApi from '@/api/sync';
import { importCrux, peekImport } from './crux-io';
import { settleIngestion } from './ingestion';
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

export async function pullCrux(cruxId: string): Promise<void> {
  if (useSyncPull.getState()[cruxId]?.busy) return;
  const report = (state: PullState) => useSyncPull.setState({ [cruxId]: state });
  report({ busy: true, message: 'Downloading from cloud...', error: '' });
  let reopen = false;
  let restoreActive = false;
  let error = '';
  try {
    const blob = await syncApi.pullCrux(cruxId);
    const { cruxData } = await peekImport(blob);
    if (cruxData.id !== cruxId) throw new Error('The cloud copy belongs to a different Crux.');
    reopen = !!getWorkspace(cruxId);
    restoreActive = useWorkspaceRegistry.getState().activeId === cruxId;
    // Save buffers before the importer's safety backup; stop writers before replacement.
    await closeCruxWorkspaces(cruxId, 'save');
    await settleIngestion();
    report({ busy: true, message: 'Importing crux...', error: '' });
    await importCrux({ data: blob, mode: 'replace' });
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    error = status === 404 ? 'No cloud version found for this crux' : 'Pull failed';
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
