import { useCruxStore } from '@/stores/cruxStore';
import { buttonClass } from '@/components/ui/button-class';
import { useGrowthCreation } from '@/hooks/useGrowthCreation';
import { GrowthTimeline } from '@/components/growth';
import { lazy, Suspense, useState } from 'react';
import { copyIdentity } from '@/services/working-copies';
const GrowthExplorer = lazy(() => import('@/components/growth/GrowthExplorer'));
export default function HistoryPane() {
  const crux = useCruxStore((s) => s.crux);
  const [exploring, setExploring] = useState(false);
  const ownerId = copyIdentity(crux)?.cruxId ?? crux?.id;
  const growths = useCruxStore((s) => s.growths);
  const summary = useCruxStore((s) => s.summary);
  const viewingSnapshotIndex = useCruxStore((s) => s.viewingSnapshotIndex);
  const viewSnapshot = useCruxStore((s) => s.viewSnapshot);
  const exitSnapshotView = useCruxStore((s) => s.exitSnapshotView);
  const { createSnapshot, isCreatingGrowth } = useGrowthCreation();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 shrink-0">
        <button
          onClick={() => setExploring(true)}
          disabled={!ownerId}
          className={buttonClass('secondary', 'sm', 'w-full py-1.5 text-xs')}
        >
          Whole Crux · branches & merges
        </button>
      </div>
      {exploring && ownerId && (
        <Suspense
          fallback={
            <p role="status" className="p-3 text-xs">
              Opening Growth…
            </p>
          }
        >
          <GrowthExplorer key={ownerId} cruxId={ownerId} onClose={() => setExploring(false)} />
        </Suspense>
      )}
      <GrowthTimeline
        growths={growths}
        summary={summary}
        isCreatingGrowth={isCreatingGrowth}
        onCreateSnapshot={createSnapshot}
        viewingSnapshotIndex={viewingSnapshotIndex}
        onViewSnapshot={viewSnapshot}
        onExitSnapshot={exitSnapshotView}
      />
    </div>
  );
}
