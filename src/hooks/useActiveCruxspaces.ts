import { useEffect, useState } from 'react';
import { useWorkspaceRegistry } from '@/stores/workspaceRegistry';
import { listCruxspaces, CRUXSPACES_CHANGED, type Cruxspace } from '@/services/cruxspaces';
import { findWorkingCopy } from '@/services/working-copies';

export interface ActiveCruxspaces {
  /** Every Cruxspace in the Garden, by name. */
  all: Cruxspace[];
  /** The Cruxspaces the active Crux belongs to (a task counts as its Crux). */
  mine: Cruxspace[];
  /** The one the breadcrumb names: the first of `mine`. */
  current: Cruxspace | null;
  /** The active Crux's own id — a task's owner, not the working copy. */
  rootId: string | null;
}

const EMPTY: ActiveCruxspaces = { all: [], mine: [], current: null, rootId: null };

/**
 * The Cruxspaces around the Crux on screen, for the breadcrumb and the
 * switcher: Garden › Cruxspace › Crux. Follows the active workspace and
 * every change to the Cruxspace list.
 */
export function useActiveCruxspaces(): ActiveCruxspaces {
  const activeId = useWorkspaceRegistry((s) => s.activeId);
  const [state, setState] = useState<ActiveCruxspaces>(EMPTY);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const [all, copy] = await Promise.all([
          listCruxspaces(),
          activeId ? findWorkingCopy(activeId) : null,
        ]);
        if (!live) return;
        const rootId = activeId ? (copy?.cruxId ?? activeId) : null;
        const mine = rootId ? all.filter((s) => s.cruxIds.includes(rootId)) : [];
        setState({ all, mine, current: mine[0] ?? null, rootId });
      } catch {
        if (live) setState(EMPTY);
      }
    };
    void load();
    window.addEventListener(CRUXSPACES_CHANGED, load);
    return () => {
      live = false;
      window.removeEventListener(CRUXSPACES_CHANGED, load);
    };
  }, [activeId]);
  return state;
}
