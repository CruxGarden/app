import { useCallback, useMemo, useEffect, useState } from 'react';
import { useMatch, useSearchParams } from 'react-router-dom';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { gardenPath, inGarden, useGardenContext } from '@/stores/gardenContext';
import { gardenAncestors, gardenMembers } from '@/services/garden-navigation';
import { CloseIcon } from '@/components/ui/icons';
import NavigationNeighborhood from './NavigationNeighborhood';
import {
  navigationNeighborhood,
  navigationVersionTarget,
} from '@/services/navigation-neighborhood';
import { getSqliteClient } from '@/services/sqlite/client';
import type { GardenIdentity } from '@/stores/gardenContext';
import NavigationTree from './NavigationTree';
import type { NavigationGraph } from './navigation-view';

/** A real workspace panel: navigation does not obscure or suspend the work. */
export default function GardenNavigator() {
  const { root, garden, revision, navigatorOpen, setNavigatorOpen } = useGardenContext();
  const route = useMatch('/c/:id');
  const navigate = useMoodNavigate();
  const [search, setSearch] = useSearchParams();
  const view = search.get('navView') === 'neighborhood' ? 'neighborhood' : 'tree';
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!navigatorOpen) return;
    return getSqliteClient().onChange?.((change) => {
      if (
        change.entity === 'database' ||
        (change.entity === 'crux' &&
          change.fields?.some((field) => field === 'title' || field === 'growth'))
      )
        setRefresh((n) => n + 1);
    });
  }, [navigatorOpen]);
  const graph = useMemo<NavigationGraph>(
    () => ({
      roots: root ? [root] : [],
      revision: revision + refresh,
      neighborhood: navigationNeighborhood,
      versionTarget: navigationVersionTarget,
      identity: async (id) => {
        const row = await getSqliteClient().get<GardenIdentity>(
          'SELECT id, title, slug, kind FROM cruxes WHERE id = ? AND deleted IS NULL',
          [id],
        );
        if (!row) throw new Error('This location is unavailable.');
        return row;
      },
      members: gardenMembers,
      ancestors: gardenAncestors,
    }),
    [root, revision, refresh],
  );
  const navigateTo = useCallback(
    (gardenId: string, cruxId: string | null, selection?: { growthId: string }) => {
      const path = cruxId ? inGarden(`/c/${cruxId}`, gardenId) : gardenPath(gardenId);
      navigate(
        `${path}${view === 'neighborhood' ? '&navView=neighborhood' : ''}${selection ? `&growth=${encodeURIComponent(selection.growthId)}` : ''}`,
      );
    },
    [navigate, view],
  );
  if (!navigatorOpen || !root || !garden) return null;
  return (
    <aside
      aria-label="Navigator"
      className="w-64 max-w-[45vw] shrink-0 border-r border-border bg-panel text-text flex flex-col min-h-0"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-display font-medium">Navigator</h2>
        <button
          aria-label="Close Navigator"
          onClick={() => setNavigatorOpen(false)}
          className="p-1 rounded hover:bg-surface cursor-pointer"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3">
        <select
          aria-label="Navigation view"
          value={view}
          onChange={(event) => {
            const next = new URLSearchParams(search);
            next.set('navView', event.target.value);
            setSearch(next, { replace: true });
          }}
          className="min-w-0 flex-1 rounded bg-surface text-sm p-1.5"
        >
          <option value="tree">Tree</option>
          <option value="neighborhood">Neighborhood</option>
        </select>
        <button
          aria-label="Refresh navigation"
          onClick={() => setRefresh((n) => n + 1)}
          className="p-1.5 rounded hover:bg-surface cursor-pointer"
        >
          ↻
        </button>
      </div>
      <div className="overflow-y-auto flex-1 px-2 pb-4">
        {view === 'tree' && (
          <p className="px-2 pt-3 pb-2 text-xxs tracking-widest uppercase text-text-muted">
            On this device
          </p>
        )}
        {view === 'tree' ? (
          <NavigationTree
            graph={graph}
            gardenId={garden.id}
            cruxId={route?.params.id ?? null}
            navigate={navigateTo}
          />
        ) : (
          <NavigationNeighborhood
            graph={graph}
            gardenId={garden.id}
            cruxId={route?.params.id ?? null}
            navigate={navigateTo}
          />
        )}
      </div>
    </aside>
  );
}
