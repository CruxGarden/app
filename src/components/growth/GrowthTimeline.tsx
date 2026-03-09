import { useState } from 'react';
import type { Dimension, CruxSummary as CruxSummaryType } from '@/api/types';
import { LoadingPanel } from '@/components/ui';
import CruxSummary from './CruxSummary';
import GrowthCard from './GrowthCard';
import GrowthDetail from './GrowthDetail';
import { cn } from '@/lib/cn';

interface GrowthTimelineProps {
  growths: Dimension[];
  summary: CruxSummaryType | null;
  isCreatingGrowth: boolean;
  onCreateSnapshot: () => void;
}

export default function GrowthTimeline({ growths, summary, isCreatingGrowth, onCreateSnapshot }: GrowthTimelineProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const activeGrowth = activeIndex !== null ? growths[activeIndex] : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeGrowth && activeIndex !== null ? (
          <GrowthDetail
            growth={activeGrowth}
            index={activeIndex}
            onClose={() => setActiveIndex(null)}
          />
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {/* Snapshot button */}
            <button
              onClick={onCreateSnapshot}
              disabled={isCreatingGrowth}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)]',
                'text-xs font-mono transition-all cursor-pointer',
                'bg-surface text-text-muted border border-border hover:border-accent hover:text-accent',
                isCreatingGrowth && 'opacity-50 cursor-wait',
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {isCreatingGrowth ? 'Capturing...' : 'Take Snapshot'}
            </button>

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
                    {growths.map((growth, i) => (
                      <GrowthCard
                        key={growth.id}
                        growth={growth}
                        index={i}
                        isActive={activeIndex === i}
                        onClick={() => setActiveIndex(i)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {growths.length === 0 && !isCreatingGrowth && !summary && (
              <p className="text-xs text-text-muted text-center py-2">
                No snapshots yet
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
