import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';

export default function SnapshotBanner() {
  const viewingSnapshotId = useCruxStore((s) => s.viewingSnapshotId);
  const viewingSnapshotIndex = useCruxStore((s) => s.viewingSnapshotIndex);
  const growths = useCruxStore((s) => s.growths);
  const exitSnapshotView = useCruxStore((s) => s.exitSnapshotView);
  const revertToSnapshot = useCruxStore((s) => s.revertToSnapshot);

  if (viewingSnapshotId === null || viewingSnapshotIndex === null) return null;

  const total = growths.length;
  const label = `Viewing snapshot ${viewingSnapshotIndex + 1} of ${total}`;

  const handleRevert = async () => {
    if (confirm('Revert workspace to this snapshot? Your current state will be saved as a snapshot first.')) {
      await revertToSnapshot(viewingSnapshotId);
    }
  };

  const btnClass = cn(
    'px-2 py-0.5 text-[11px] font-mono rounded-[var(--radius-sm)]',
    'text-text-muted hover:text-text border border-border hover:border-accent/50 transition-colors cursor-pointer',
  );

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-surface border-b border-accent/30">
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-xs font-mono text-accent">{label}</span>
        <span className="text-[10px] text-text-muted">read-only</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={handleRevert} className={btnClass}>
          Revert
        </button>
        <button
          onClick={exitSnapshotView}
          className={cn(
            'px-2 py-0.5 text-[11px] font-mono rounded-[var(--radius-sm)]',
            'bg-accent text-bg hover:brightness-110 transition-all cursor-pointer',
          )}
        >
          Back
        </button>
      </div>
    </div>
  );
}
