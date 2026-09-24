import { useGardenContext } from '@/stores/gardenContext';
import { CloseIcon } from '@/components/ui/icons';
import NavigationPresentation from './NavigationPresentation';
import NavigationSearch from './NavigationSearch';
import { useNavigationView } from './useNavigationView';

/** A real workspace panel: navigation does not obscure or suspend the work. */
export default function GardenNavigator() {
  const { root, garden, navigatorOpen, setNavigatorOpen } = useGardenContext();
  const viewProps = useNavigationView(navigatorOpen);
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
      <NavigationSearch {...viewProps}>
        <NavigationPresentation key={garden.id} {...viewProps} />
      </NavigationSearch>
    </aside>
  );
}
