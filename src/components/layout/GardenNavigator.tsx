import { useCallback, useMemo } from 'react';
import { useMatch } from 'react-router-dom';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { gardenPath, inGarden, useGardenContext } from '@/stores/gardenContext';
import { gardenAncestors, gardenMembers } from '@/services/garden-navigation';
import { CloseIcon } from '@/components/ui/icons';
import NavigationTree, { type NavigationGraph } from './NavigationTree';

/** A real workspace panel: navigation does not obscure or suspend the work. */
export default function GardenNavigator() {
  const { root, garden, revision, navigatorOpen, setNavigatorOpen } = useGardenContext();
  const route = useMatch('/c/:id');
  const navigate = useMoodNavigate();
  const graph = useMemo<NavigationGraph>(
    () => ({
      roots: root ? [root] : [],
      revision,
      members: gardenMembers,
      ancestors: gardenAncestors,
    }),
    [root, revision],
  );
  const navigateTo = useCallback(
    (gardenId: string, cruxId: string | null) => {
      navigate(cruxId ? inGarden(`/c/${cruxId}`, gardenId) : gardenPath(gardenId));
    },
    [navigate],
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
      <div className="overflow-y-auto flex-1 px-2 pb-4">
        <p className="px-2 pt-3 pb-2 text-xxs tracking-widest uppercase text-text-muted">
          On this device
        </p>
        <NavigationTree
          graph={graph}
          gardenId={garden.id}
          cruxId={route?.params.id ?? null}
          navigate={navigateTo}
        />
      </div>
    </aside>
  );
}
