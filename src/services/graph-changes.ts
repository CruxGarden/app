import type { LocalGraphChange } from '@/lib/platform';
import { getSqliteClient } from './sqlite/client';
import { allWorkspaces } from '@/stores/workspaceRegistry';
import { useGardenStore } from '@/stores/gardenStore';

let unsubscribe: (() => void) | undefined;
/** Host notices carry identities only. Existing services reread committed state.
 * Reinitialization replaces the subscription, never multiplies it. */
export function initGraphChanges(): void {
  unsubscribe?.();
  let pending = Promise.resolve();
  const off = getSqliteClient().onChange?.((change) => {
    pending = pending
      .then(() => applyGraphChange(change))
      .catch((error) => console.error('[graph changes]', error));
  });
  unsubscribe = off;
}

export async function applyGraphChange(change: LocalGraphChange): Promise<void> {
  if (change.entity === 'crux-lifecycle') {
    await useGardenStore.getState().refresh();
    return;
  }
  if (change.entity !== 'crux' && change.entity !== 'working-copy') return;
  const fields = change.fields ?? [];
  const keys = change.metaKeys ?? [];
  // Most notices describe chat persistence; those live sessions already own
  // their state. Avoid refreshing panels for every streamed metadata save.
  if (!fields.some((f) => f !== 'meta') && !keys.includes('notes')) return;
  const refreshes = allWorkspaces().map(async (w) => {
    // A commit can arrive after an opening workspace's initial read but before
    // its load completes. Recheck its resolved owner after that load.
    if (w.phase === 'loading') await w.loaded.catch(() => {});
    if (
      w.phase !== 'ready' ||
      !(
        w.id === change.id ||
        (change.entity === 'crux' && w.cruxId === change.id && fields.includes('title'))
      )
    )
      return;
    await w.data
      .getState()
      .refreshDetails(w.id === change.id ? fields : ['title'], w.id === change.id ? keys : []);
  });
  if (change.entity === 'working-copy' || fields.includes('title'))
    window.dispatchEvent(new Event('crux:tasks-changed'));
  if (change.entity === 'crux' && !useGardenStore.getState().loading)
    refreshes.push(useGardenStore.getState().refresh());
  await Promise.all(refreshes);
}
