import { useAiEnabled } from '@/hooks/useAiEnabled';
import EditHistory from './EditHistory';
import { getSqliteClient } from '@/services/sqlite/client';
import { useCruxStoreApi } from '@/stores/cruxStore';
import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { getServices } from '@/services';
import { compareFilesOf } from '@/services/version-compare';
import type { CompareSource } from './CompareVersions';
import type { Dimension, CruxSummary as CruxSummaryType } from '@/api/types';
import { LoadingPanel, SegmentedControl, buttonClass, fieldClass } from '@/components/ui';
import { useCruxStore } from '@/stores/cruxStore';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';
import CruxSummary from './CruxSummary';
import GrowthCard from './GrowthCard';
import GrowthDetail from './GrowthDetail';
import { PaneAction, PaneEmpty } from '@/components/workspace/pane-ui';

const CompareVersions = lazy(() => import('./CompareVersions'));

function LayersIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

interface GrowthTimelineProps {
  growths: Dimension[];
  summary: CruxSummaryType | null;
  isCreatingGrowth: boolean;
  onCreateSnapshot: (label?: string) => Promise<boolean>;
  viewingSnapshotIndex: number | null;
  onViewSnapshot: (snapshotId: string, index: number) => void;
  onExitSnapshot: () => void;
}

export default function GrowthTimeline({
  growths,
  summary,
  isCreatingGrowth,
  onCreateSnapshot,
  viewingSnapshotIndex,
  onViewSnapshot,
  onExitSnapshot,
}: GrowthTimelineProps) {
  const aiEnabled = useAiEnabled();
  const cruxStore = useCruxStoreApi();
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [labelText, setLabelText] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  const crux = useCruxStore((s) => s.crux);
  const [view, setView] = useState<'growth' | 'history'>('growth');
  const detailGrowth = detailIndex !== null ? growths[detailIndex] : null;
  const isViewingSnapshot = viewingSnapshotIndex !== null;

  useEffect(() => {
    if (showLabelInput) labelInputRef.current?.focus();
  }, [showLabelInput]);

  // Compare with current: read-only, so it is offered while viewing a version too.
  const [compare, setCompare] = useState<CompareSource | null>(null);
  const [removing, setRemoving] = useState(false);
  const handleRemoveLatest = async () => {
    const tip = growths[growths.length - 1];
    if (!tip) return;
    const name =
      (tip.meta?.label as string | undefined) || tip.target?.title || `Snapshot ${growths.length}`;
    const ok = await confirmDialog({
      title: 'Remove last snapshot',
      message: `Remove "${name}" from history? Your files stay exactly as they are; only this checkpoint goes.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await cruxStore.getState().removeLatestSnapshot();
      setDetailIndex(null);
    } catch (err) {
      await alertDialog(
        (err as Error)?.message || 'Could not remove the snapshot',
        'Remove last snapshot',
      );
    } finally {
      setRemoving(false);
    }
  };

  const handleSnapshot = async () => {
    const label = labelText.trim() || undefined;
    if (!(await onCreateSnapshot(label))) return;
    setShowLabelInput(false);
    setLabelText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {crux && getSqliteClient().fileContent && (
        <SegmentedControl
          label="Growth views"
          className="mx-3 mt-2 self-start"
          value={view}
          onChange={setView}
          options={[
            { value: 'growth', label: 'Versions' },
            { value: 'history', label: 'Edits' },
          ]}
        />
      )}
      <div className="flex-1 overflow-y-auto min-h-0">
        {view === 'history' && crux ? (
          <EditHistory key={crux.id} cruxId={crux.id} onCompare={setCompare} />
        ) : (
          <>
            {detailGrowth && detailIndex !== null ? (
              <GrowthDetail
                growth={detailGrowth}
                index={detailIndex}
                onClose={() => setDetailIndex(null)}
              />
            ) : (
              <div className="flex flex-col gap-3 p-3">
                {/* Capture controls — hidden while viewing a snapshot */}
                {!isViewingSnapshot && !showLabelInput && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PaneAction
                      onClick={() => setShowLabelInput(true)}
                      disabled={isCreatingGrowth}
                      busy={isCreatingGrowth && 'Capturing...'}
                      icon={<LayersIcon />}
                      className="flex-1"
                    >
                      Mark version
                    </PaneAction>
                  </div>
                )}
                {/* Walk history back one step: the tip goes, files stay */}
                {!isViewingSnapshot && !showLabelInput && growths.length > 0 && (
                  <button
                    onClick={handleRemoveLatest}
                    disabled={isCreatingGrowth || removing}
                    className={buttonClass(
                      'ghost',
                      'xs',
                      'self-start -ml-2.5 min-h-6 py-0.5 text-2xs text-text-muted hover:text-error',
                    )}
                    title="Remove the most recent snapshot. Your files stay as they are."
                    data-testid="growth-remove-latest"
                  >
                    {removing ? 'Removing…' : 'Remove last snapshot'}
                  </button>
                )}
                {!isViewingSnapshot && showLabelInput && (
                  <div className="flex gap-1.5">
                    <input
                      ref={labelInputRef}
                      disabled={isCreatingGrowth}
                      type="text"
                      value={labelText}
                      onChange={(e) => setLabelText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSnapshot();
                        if (e.key === 'Escape') {
                          setShowLabelInput(false);
                          setLabelText('');
                        }
                      }}
                      placeholder="Label (optional)"
                      className={fieldClass(undefined, 'flex-1 min-w-0', 'sm')}
                    />
                    <button
                      disabled={isCreatingGrowth}
                      onClick={handleSnapshot}
                      className={buttonClass('primary', 'sm')}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setShowLabelInput(false);
                        setLabelText('');
                      }}
                      aria-label="Cancel"
                      className={buttonClass('ghost', 'sm', 'w-8 px-0 text-text-muted')}
                    >
                      &times;
                    </button>
                  </div>
                )}

                {/* Back to current — shown while viewing a snapshot */}
                {isViewingSnapshot && (
                  <PaneAction onClick={onExitSnapshot} icon={<BackIcon />}>
                    Back to current
                  </PaneAction>
                )}

                {aiEnabled && summary && <CruxSummary summary={summary} className="mb-1" />}

                {isCreatingGrowth && (
                  <div className="px-2">
                    <LoadingPanel label="Capturing snapshot..." />
                  </div>
                )}

                {growths.length > 0 && (
                  <div className="relative">
                    <div className="relative flex flex-col gap-3">
                      {/* Reverse chronological — most recent first */}
                      {[...growths].reverse().map((growth) => {
                        const originalIndex = growths.indexOf(growth);
                        return (
                          <GrowthCard
                            key={growth.id}
                            growth={growth}
                            index={originalIndex}
                            isActive={detailIndex === originalIndex}
                            isViewing={viewingSnapshotIndex === originalIndex}
                            onClick={() => onViewSnapshot(growth.targetId, originalIndex)}
                            onCompare={() =>
                              setCompare({
                                title:
                                  (growth.meta?.label as string | undefined) ||
                                  `Snapshot ${originalIndex + 1}`,
                                load: async () =>
                                  compareFilesOf(
                                    await getServices().artifact.findByResource(
                                      'crux',
                                      growth.targetId,
                                    ),
                                  ),
                              })
                            }
                            onDetailClick={(e) => {
                              e.stopPropagation();
                              setDetailIndex(detailIndex === originalIndex ? null : originalIndex);
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {growths.length === 0 && !isCreatingGrowth && !summary && (
                  <PaneEmpty
                    title="No snapshots yet"
                    description="Mark a version when it matters: a demo, a rough mix, a master. Routine saves live in Edit history."
                    className="py-6"
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>
      {compare && (
        <Suspense fallback={null}>
          <CompareVersions source={compare} onClose={() => setCompare(null)} />
        </Suspense>
      )}
    </div>
  );
}
