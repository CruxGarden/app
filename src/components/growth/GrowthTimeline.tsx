import { useState, useRef, useEffect } from 'react';
import type { Dimension, CruxSummary as CruxSummaryType } from '@/api/types';
import { LoadingPanel } from '@/components/ui';
import { useCruxStore } from '@/stores/cruxStore';
import CruxSummary from './CruxSummary';
import GrowthCard from './GrowthCard';
import GrowthDetail from './GrowthDetail';
import { cn } from '@/lib/cn';

type SnapshotFrequency = 'ai-turn' | '2m' | '5m' | '10m' | 'manual';
const FREQUENCY_OPTIONS: { value: SnapshotFrequency; label: string }[] = [
  { value: 'ai-turn', label: 'Every AI turn' },
  { value: '2m', label: 'Every 2 min' },
  { value: '5m', label: 'Every 5 min' },
  { value: '10m', label: 'Every 10 min' },
  { value: 'manual', label: 'Manual only' },
];

interface GrowthTimelineProps {
  growths: Dimension[];
  summary: CruxSummaryType | null;
  isCreatingGrowth: boolean;
  onCreateSnapshot: (label?: string) => void;
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
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [labelText, setLabelText] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);

  const crux = useCruxStore((s) => s.crux);
  const saveMeta = useCruxStore((s) => s.saveMeta);
  const frequency = (crux?.meta?.settings?.snapshotFrequency as SnapshotFrequency) || 'ai-turn';

  const setFrequency = (freq: SnapshotFrequency) => {
    if (!crux) return;
    useCruxStore
      .getState()
      .patchCruxMeta({ settings: { ...crux.meta?.settings, snapshotFrequency: freq } });
    saveMeta();
  };

  const detailGrowth = detailIndex !== null ? growths[detailIndex] : null;
  const isViewingSnapshot = viewingSnapshotIndex !== null;

  useEffect(() => {
    if (showLabelInput) labelInputRef.current?.focus();
  }, [showLabelInput]);

  const handleSnapshot = () => {
    const label = labelText.trim() || undefined;
    setShowLabelInput(false);
    setLabelText('');
    onCreateSnapshot(label);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        {detailGrowth && detailIndex !== null ? (
          <GrowthDetail
            growth={detailGrowth}
            index={detailIndex}
            onClose={() => setDetailIndex(null)}
          />
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {/* Snapshot button + label input — hidden while viewing a snapshot */}
            {!isViewingSnapshot && !showLabelInput && (
              <button
                onClick={() => setShowLabelInput(true)}
                disabled={isCreatingGrowth}
                className={cn(
                  'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)]',
                  'text-xs font-mono transition-all cursor-pointer',
                  'bg-surface text-text-muted border border-border hover:border-accent hover:text-accent',
                  isCreatingGrowth && 'opacity-50 cursor-wait',
                )}
              >
                <svg
                  width="12"
                  height="12"
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
                {isCreatingGrowth ? 'Capturing...' : 'Take Snapshot'}
              </button>
            )}
            {!isViewingSnapshot && showLabelInput && (
              <div className="flex gap-1.5">
                <input
                  ref={labelInputRef}
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
                  className={cn(
                    'flex-1 px-2 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                    'bg-surface border border-border text-text placeholder:text-text-muted',
                    'focus:outline-none focus:border-accent',
                  )}
                />
                <button
                  onClick={handleSnapshot}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
                    'bg-accent text-bg hover:brightness-110 transition-all cursor-pointer',
                  )}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowLabelInput(false);
                    setLabelText('');
                  }}
                  className="px-1.5 py-1.5 text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Auto-snapshot frequency selector */}
            {!isViewingSnapshot && !showLabelInput && (
              <div className="flex items-center justify-between px-1">
                <span className="text-[10px] text-text-muted">Auto-snapshot:</span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as SnapshotFrequency)}
                  className={cn(
                    'text-[10px] font-mono bg-transparent text-text-muted',
                    'border-none outline-none cursor-pointer',
                  )}
                >
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Back to current button — shown while viewing a snapshot */}
            {isViewingSnapshot && (
              <button
                onClick={onExitSnapshot}
                className={cn(
                  'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)]',
                  'text-xs font-mono transition-all cursor-pointer',
                  'bg-accent text-bg border border-accent hover:brightness-110',
                )}
              >
                <svg
                  width="12"
                  height="12"
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
                Back to Current
              </button>
            )}

            {summary && <CruxSummary summary={summary} className="mb-1" />}

            {isCreatingGrowth && (
              <div className="px-2">
                <LoadingPanel label="Capturing snapshot..." />
              </div>
            )}

            {growths.length > 0 && (
              <div className="flex flex-col">
                <div className="relative">
                  <div className="absolute left-[17px] top-0 bottom-0 w-px bg-border" />
                  <div className="relative flex flex-col gap-0.5">
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
                          onDetailClick={(e) => {
                            e.stopPropagation();
                            setDetailIndex(detailIndex === originalIndex ? null : originalIndex);
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {growths.length === 0 && !isCreatingGrowth && !summary && (
              <p className="text-xs text-text-muted text-center py-2">No snapshots yet</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
