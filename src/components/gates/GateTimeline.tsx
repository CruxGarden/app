import { useState } from 'react';
import type { Dimension, CruxSummary as CruxSummaryType } from '@/api/types';
import CruxSummary from './CruxSummary';
import GateCard from './GateCard';
import GateDetail from './GateDetail';

interface GateTimelineProps {
  gates: Dimension[];
  gateCount: number;
  summary: CruxSummaryType | null;
  isCreatingGate: boolean;
}

function GateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      <circle cx="12" cy="5" r="3" />
    </svg>
  );
}

function SpinnerSmall() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" opacity="0.3" />
      <path d="M12 2v4" strokeLinecap="round" />
    </svg>
  );
}

export default function GateTimeline({
  gates,
  gateCount,
  summary,
  isCreatingGate,
}: GateTimelineProps) {
  const [activeGateIndex, setActiveGateIndex] = useState<number | null>(null);

  const activeGate = activeGateIndex !== null ? gates[activeGateIndex] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-text-muted">
          <GateIcon />
          <span className="text-xs font-mono uppercase tracking-wider">Gates</span>
        </div>
        <span className="text-[10px] text-text-muted font-mono">
          {gateCount}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeGate && activeGateIndex !== null ? (
          <GateDetail
            gate={activeGate}
            index={activeGateIndex}
            onClose={() => setActiveGateIndex(null)}
          />
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {/* Summary */}
            {summary && <CruxSummary summary={summary} className="mb-1" />}

            {/* Gate creating indicator */}
            {isCreatingGate && (
              <div className="flex items-center gap-2 px-3 py-2 text-accent">
                <SpinnerSmall />
                <span className="text-xs font-mono">Capturing gate...</span>
              </div>
            )}

            {/* Timeline */}
            {gates.length > 0 ? (
              <div className="flex flex-col">
                {/* Vertical line */}
                <div className="relative">
                  <div className="absolute left-[17px] top-0 bottom-0 w-px bg-border" />
                  <div className="relative flex flex-col gap-0.5">
                    {gates.map((gate, i) => (
                      <GateCard
                        key={gate.id}
                        gate={gate}
                        index={i}
                        isActive={activeGateIndex === i}
                        onClick={() => setActiveGateIndex(i)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              !isCreatingGate && (
                <div className="flex flex-col items-center justify-center py-8 text-text-muted">
                  <GateIcon />
                  <p className="text-xs mt-2 text-center px-4">
                    Gates appear here as artifacts are created during your conversation.
                  </p>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
