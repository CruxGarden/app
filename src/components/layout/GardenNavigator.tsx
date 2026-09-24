import { useSearchParams } from 'react-router-dom';
import { useGardenContext } from '@/stores/gardenContext';
import { CloseIcon } from '@/components/ui/icons';
import NavigationNeighborhood from './NavigationNeighborhood';
import NavigationTree from './NavigationTree';
import { useNavigationView } from './useNavigationView';

/** A real workspace panel: navigation does not obscure or suspend the work. */
export default function GardenNavigator() {
  const { root, garden, navigatorOpen, setNavigatorOpen } = useGardenContext();
  const viewProps = useNavigationView(navigatorOpen);
  const [search, setSearch] = useSearchParams();
  const view = search.get('navView') === 'neighborhood' ? 'neighborhood' : 'tree';
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
          onClick={viewProps.refresh}
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
          <NavigationTree {...viewProps} />
        ) : (
          <NavigationNeighborhood {...viewProps} />
        )}
      </div>
    </aside>
  );
}
