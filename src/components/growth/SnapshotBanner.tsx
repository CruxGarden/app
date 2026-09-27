import { useState } from 'react';
import { buttonClass } from '@/components/ui/button-class';
import { RESTORE_RECOVERED_MESSAGE, type RestoreReport } from '@/services/growth';
import { motion } from 'motion/react';
import { useMotionRole } from '@/hooks/useMotionRole';
import { isEmbeddedApp } from '@/services/embedded-app';
import { useCruxStore } from '@/stores/cruxStore';
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

  const restore = async (action: () => Promise<RestoreReport | void>) => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await action();
      if (result?.recovered) await alertDialog(RESTORE_RECOVERED_MESSAGE, 'Recovery complete');
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
          ? 'Restore the app code and all its content to this checkpoint? Later content will be replaced. Your current state will be kept as a safety copy first.'
          : 'Revert workspace to this snapshot? Your current state will be kept as a safety copy first.',
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

  const btnClass = buttonClass('secondary', 'xs', 'min-h-6 py-0.5 px-2 text-xxs');

  return (
    <motion.div
      role="region"
      aria-label="Viewing a snapshot"
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
          // The banner's own action colour stays the Mood's (snapshotBannerButton*);
          // its shape and behaviour are the shared primary button's.
          className={buttonClass(
            'primary',
            'xs',
            'min-h-6 py-0.5 px-2 text-xxs bg-snapshot-banner-button hover:bg-snapshot-banner-button-hover text-bg border-transparent hover:border-transparent bg-none',
          )}
        >
          Back to current
        </button>
      </div>
    </motion.div>
  );
}
