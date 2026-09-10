import { getSetting } from '@/services/settings';
import { create } from 'zustand';
import { useMemo } from 'react';
import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import { fromRow } from '@/services/sqlite/helpers';
import { TASKS_CHANGED, type WorkingCopy } from '@/services/working-copies';
import { GROWTH_CHANGED_EVENT } from '@/services/growth';
import { tendingState, type TendingState } from '@/services/tending-state';
import type { CruxMeta } from '@/api/types';
import type { TurnJob } from '@/services/turn-jobs';
import { useWorkspaceRegistry } from './workspaceRegistry';
import { useGardenStore } from './gardenStore';

export interface TendingRow {
  id: string;
  cruxId: string;
  cruxTitle: string;
  title: string;
  phase: 'main' | WorkingCopy['phase'];
  model: string;
  state: TendingState;
}
export const useTendingCatalog = create<{ rows: TendingRow[]; loading: boolean; error: string }>(
  () => ({ rows: [], loading: true, error: '' }),
);
function savedState(id: string, cruxId: string, meta: CruxMeta): TendingState {
  return tendingState({
    copyId: id,
    cruxId,
    job: (meta.turnJob as TurnJob | undefined) ?? null,
    queued: Array.isArray(meta.turnQueue) ? meta.turnQueue.length : 0,
    seenTurnId: getSetting(`cruxgarden:tending-seen:${id}`),
  });
}
/** Read metadata only: browsing Tending never opens an editor, preview or agent. */
export function startTendingCatalog(): () => void {
  let disposed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    const ticket = ++generation;
    try {
      const [cruxes, raw] = await Promise.all([
        getServices().crux.listAll(),
        getSqliteClient().all(
          "SELECT * FROM working_copies WHERE role = 'task' ORDER BY created, id",
        ),
      ]);
      if (disposed || ticket !== generation) return;
      const copies = raw.map((row) => fromRow<WorkingCopy>(row));
      const rows = cruxes
        .filter((c) => c.kind !== 'snapshot')
        .flatMap((c): TendingRow[] => {
          const cruxTitle = c.title || 'Untitled';
          return [
            {
              id: c.id,
              cruxId: c.id,
              cruxTitle,
              title: 'Main',
              phase: 'main',
              model: c.meta?.settings?.model ?? 'Default model',
              state: savedState(c.id, c.id, c.meta ?? {}),
            },
            ...copies
              .filter((t) => t.cruxId === c.id)
              .map((t) => ({
                id: t.id,
                cruxId: c.id,
                cruxTitle,
                title: t.title,
                phase: t.phase,
                model: t.meta.settings?.model ?? 'Default model',
                state: savedState(t.id, c.id, t.meta),
              })),
          ];
        });
      useTendingCatalog.setState({ rows, loading: false, error: '' });
    } catch (error) {
      if (!disposed && ticket === generation)
        useTendingCatalog.setState({ loading: false, error: (error as Error).message });
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh(), 100);
  };
  const offGarden = useGardenStore.subscribe((s, old) => {
    if (s.allCruxes !== old.allCruxes) schedule();
  });
  const offRegistry = useWorkspaceRegistry.subscribe((s, old) => {
    // Runtime changes use the live projection. Reload metadata only on open/close.
    if (s.entries.map((e) => e.id).join() !== old.entries.map((e) => e.id).join()) schedule();
  });
  window.addEventListener(TASKS_CHANGED, schedule);
  window.addEventListener(GROWTH_CHANGED_EVENT, schedule);
  void refresh();
  return () => {
    disposed = true;
    clearTimeout(timer);
    offGarden();
    offRegistry();
    window.removeEventListener(TASKS_CHANGED, schedule);
    window.removeEventListener(GROWTH_CHANGED_EVENT, schedule);
  };
}
export function useTendingRows(): TendingRow[] {
  const rows = useTendingCatalog((s) => s.rows);
  const entries = useWorkspaceRegistry((s) => s.entries);
  return useMemo(() => {
    const live = new Map(entries.filter((e) => e.tending).map((e) => [e.id, e.tending!]));
    return rows.map((row) => {
      const state = live.get(row.id) ?? row.state;
      // Completed/archived Tasks remain visible, but old run results need no badge.
      return {
        ...row,
        state: ['merged', 'archived'].includes(row.phase) ? { ...state, attention: [] } : state,
      };
    });
  }, [rows, entries]);
}
