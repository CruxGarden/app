import { useGardenContext } from '@/stores/gardenContext';
import NavigationPresentation from '@/components/layout/NavigationPresentation';
import NavigationSearch from '@/components/layout/NavigationSearch';
import { useNavigationView } from '@/components/layout/useNavigationView';

/** The Navigator, as a pane: resizable and rearrangeable like any other. */
export default function NavigatorPane() {
  const root = useGardenContext((s) => s.root);
  const garden = useGardenContext((s) => s.garden);
  const viewProps = useNavigationView(true);
  if (!root || !garden) return null;
  return (
    <aside aria-label="Navigator" className="h-full min-h-0 flex flex-col text-text">
      <NavigationSearch {...viewProps}>
        <NavigationPresentation key={garden.id} {...viewProps} />
      </NavigationSearch>
    </aside>
  );
}
