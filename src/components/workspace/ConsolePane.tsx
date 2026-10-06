import { lazy, Suspense } from 'react';
import { useGardenContext } from '@/stores/gardenContext';
import { useUIStore } from '@/stores/uiStore';
import { PaneEmpty } from './pane-ui';
import { openSettings } from '@/components/layout/app-commands';
import { linkClass } from '@/components/ui/button-class';

const Console = lazy(() => import('@/components/keeper/Console'));

/** The Garden's own Collaboration, beside whatever else is open. */
export default function ConsolePane() {
  const garden = useGardenContext((s) => s.garden);
  const aiEnabled = useUIStore((s) => s.aiEnabled);
  if (!garden) return null;
  if (!aiEnabled)
    return (
      <PaneEmpty
        title="The collaborator is off"
        description={
          <>
            Turn it on in{' '}
            <button
              type="button"
              className={linkClass()}
              onClick={() => openSettings({ section: 'ai' })}
            >
              Settings → AI
            </button>{' '}
            to talk with this Garden.
          </>
        }
        className="h-full"
      />
    );
  return (
    <div className="h-full min-h-0 flex flex-col">
      <Suspense fallback={null}>
        <Console key={garden.id} />
      </Suspense>
    </div>
  );
}
