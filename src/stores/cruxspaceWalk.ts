import type { StoreApi } from 'zustand';
import type { CruxState } from './cruxStore';
import { allWorkspaces } from './workspaceRegistry';
import type { WorkspaceStores } from './workspaceSelection';
import {
  CRUXSPACE_MOMENT_CHANGED,
  getCruxspaceMoment,
  snapshotIndexAt,
} from '@/services/cruxspace-moment';
import { listCruxspaces } from '@/services/cruxspaces';
import { copyIdentity } from '@/services/working-copies';

/**
 * Applies the Cruxspace moment a person is walking through to workspaces:
 * every member of that Cruxspace shows its last checkpoint at or before the
 * moment, read-only. Works on every open workspace, not only the visible one,
 * so "Back to now" releases them all (an export or a Task refuses a Crux left
 * in snapshot view).
 */
const applied = new WeakMap<StoreApi<CruxState>, string>();

async function isMember(spaceId: string, cruxId: string) {
  return (await listCruxspaces()).some((s) => s.id === spaceId && s.cruxIds.includes(cruxId));
}

export async function applyCruxspaceWalk(workspace: WorkspaceStores): Promise<void> {
  const store = workspace.data;
  const state = store.getState();
  const crux = state.crux;
  if (!crux || copyIdentity(crux)) return; // Task lanes are left alone
  const moment = getCruxspaceMoment();
  const wanted =
    moment && (await isMember(moment.spaceId, crux.id))
      ? snapshotIndexAt(store.getState().growths, moment.at)
      : null;
  const current = store.getState();
  const wantedId = wanted === null ? null : (current.growths[wanted]?.targetId ?? null);
  if (moment && wantedId) {
    if (current.viewingSnapshotId !== wantedId) {
      applied.set(store, wantedId);
      await current.viewSnapshot(wantedId, wanted!);
    }
    return;
  }
  const mine = applied.get(store);
  if (mine) {
    applied.delete(store);
    if (current.viewingSnapshotId === mine) await current.exitSnapshotView();
  }
}

let started = false;
/** Idempotent: listen for moment changes and apply them to every open workspace. */
export function startCruxspaceWalk(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener(CRUXSPACE_MOMENT_CHANGED, () => {
    for (const workspace of allWorkspaces()) void applyCruxspaceWalk(workspace);
  });
}
