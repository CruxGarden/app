import { cn } from '@/lib/cn';
import type { Dimension } from '@/api/types';

interface GateCardProps {
  gate: Dimension;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function GateCard({ gate, index, isActive, onClick }: GateCardProps) {
  const title = gate.target?.title || `Snapshot ${index + 1}`;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors duration-150 cursor-pointer',
        'border',
        isActive
          ? 'bg-accent-muted border-accent/30 text-text'
          : 'bg-transparent border-transparent text-text-muted hover:bg-surface/50 hover:text-text',
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Timeline dot */}
        <div className="flex flex-col items-center pt-1.5 shrink-0">
          <div className={cn('w-2 h-2 rounded-full', isActive ? 'bg-accent' : 'bg-border')} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-mono text-accent/70 uppercase">#{index + 1}</span>
            <span className="text-[10px] text-text-muted shrink-0">{formatTime(gate.created)}</span>
          </div>
          <div className="text-sm font-body mt-0.5 truncate">{title}</div>
        </div>
      </div>
    </button>
  );
}
