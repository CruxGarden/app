import { useState } from 'react';
import { motion } from 'motion/react';
import { useMotionRole } from '@/hooks/useMotionRole';
import { isEmbeddedApp } from '@/services/embedded-app';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';

export default function SnapshotBanner() {
  const toast = useMotionRole('toast');
  const embedded = useCruxStore((s) => isEmbeddedApp(s.crux));
  const viewingSnapshotId = useCruxStore((s) => s.viewingSnapshotId);
  const viewingSnapshotIndex = useCruxStore((s) => s.viewingSnapshotIndex);
  const growths = useCruxStore((s) => s.growths);
  const exitSnapshotView = useCruxStore((s) => s.exitSnapshotView);
  const revertToSnapshot = useCruxStore((s) => s.revertToSnapshot);
  const branchFromSnapshot = useCruxStore((s) => s.branchFromSnapshot);
  // Branch: the same action the collaborator's `branch` tool has — every AI
  // control has a UI control. A label, then the workspace continues from here.
  const [branching, setBranching] = useState(false);
  const [branchLabel, setBranchLabel] = useState('');
  const [restoring, setRestoring] = useState(false);

  if (viewingSnapshotId === null || viewingSnapshotIndex === null) return null;

  const total = growths.length;
  const label = `Viewing snapshot ${viewingSnapshotIndex + 1} of ${total}`;

  const restore = async (action: () => Promise<void>) => {
    if (restoring) return;
    setRestoring(true);
    try {
      await action();
    } catch (error) {
      await alertDialog(
        error instanceof Error ? error.message : 'Could not restore this snapshot. Try again.',
        'Restore failed',
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleRevert = async () => {
    if (
      await confirmDialog({
        title: 'Revert to snapshot',
        message: embedded
          ? 'Restore the app code and all its content to this checkpoint? Later content will be replaced. Your current state will be saved as a snapshot first.'
          : 'Revert workspace to this snapshot? Your current state will be saved as a snapshot first.',
        confirmLabel: 'Revert',
      })
    ) {
      await restore(() => revertToSnapshot(viewingSnapshotId));
    }
  };

  const handleBranch = async () => {
    const label = branchLabel.trim() || `Branch from snapshot ${viewingSnapshotIndex + 1}`;
    await restore(async () => {
      await branchFromSnapshot(viewingSnapshotId, label);
      setBranching(false);
      setBranchLabel('');
    });
  };

  const btnClass = cn(
    'px-2 py-0.5 text-xxs font-mono rounded-[var(--radius-sm)]',
    'text-text-muted hover:text-text border border-border hover:border-accent/50 transition-colors cursor-pointer',
  );

  return (
    <motion.div
      data-motion-role="toast"
      initial={toast.initial}
      animate={toast.animate}
      className="flex items-center justify-between gap-3 px-3 py-1.5 bg-snapshot-banner text-snapshot-banner-text border-b border-snapshot-banner-border"
    >
      <div className="flex items-center gap-2">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-xs font-mono text-accent">{label}</span>
        <span className="text-2xs text-text-muted">read-only</span>
      </div>
      <div className="flex items-center gap-1.5">
        {branching ? (
          <>
            <input
              disabled={restoring}
              autoFocus
              aria-label="Branch label"
              value={branchLabel}
              onChange={(e) => setBranchLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleBranch();
                if (e.key === 'Escape') {
                  setBranching(false);
                  setBranchLabel('');
                }
              }}
              placeholder="Branch label (optional)"
              className="h-6 w-44 px-2 text-xxs font-body rounded-[var(--radius-sm)] bg-surface border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-input-border-active"
            />
            <button disabled={restoring} onClick={() => void handleBranch()} className={btnClass}>
              Create branch
            </button>
          </>
        ) : (
          <button
            disabled={restoring}
            onClick={() => setBranching(true)}
            className={btnClass}
            title="Continue from this snapshot on a new line of history"
          >
            Branch
          </button>
        )}
        <button disabled={restoring} onClick={handleRevert} className={btnClass}>
          Revert
        </button>
        <button
          disabled={restoring}
          onClick={exitSnapshotView}
          className={cn(
            'px-2 py-0.5 text-xxs font-mono rounded-button',
            'bg-snapshot-banner-button text-bg hover:bg-snapshot-banner-button-hover transition-colors motion-press cursor-pointer',
          )}
        >
          Back
        </button>
      </div>
    </motion.div>
  );
}
