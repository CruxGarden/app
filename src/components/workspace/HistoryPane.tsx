import { useCruxStore } from '@/stores/cruxStore';
import { useGrowthCreation } from '@/hooks/useGrowthCreation';
import { GrowthTimeline } from '@/components/growth';
export default function HistoryPane() {
  const growths = useCruxStore((s) => s.growths);
  const summary = useCruxStore((s) => s.summary);
  const viewingSnapshotIndex = useCruxStore((s) => s.viewingSnapshotIndex);
  const viewSnapshot = useCruxStore((s) => s.viewSnapshot);
  const exitSnapshotView = useCruxStore((s) => s.exitSnapshotView);
  const { createSnapshot, isCreatingGrowth } = useGrowthCreation();

  return (
    <div className="flex flex-col h-full">
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
