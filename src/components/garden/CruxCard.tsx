import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import type { Crux } from '@/api/types';

interface CruxCardProps {
  crux: Crux;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function GateIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V8" />
      <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
      <circle cx="12" cy="5" r="3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export default function CruxCard({ crux }: CruxCardProps) {
  const navigate = useNavigate();

  const gateCount = crux.meta?.gateCount || 0;
  const summary = crux.meta?.summary;
  const lastGateLabel = summary?.stage;

  return (
    <button
      onClick={() => navigate(`/crux/${crux.id}`)}
      className={cn(
        'bg-panel backdrop-blur-[var(--panel-blur)] border border-border rounded-[var(--radius)] p-4 text-left',
        'hover:border-accent/30 hover:bg-surface/50 transition-all duration-200 cursor-pointer',
        'w-full flex flex-col gap-2',
      )}
    >
      {/* Title */}
      <h3 className="font-display text-sm font-medium text-text truncate">
        {crux.title || crux.slug}
      </h3>

      {/* Summary purpose or description */}
      {(summary?.purpose || crux.description) && (
        <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
          {summary?.purpose || crux.description}
        </p>
      )}

      {/* Last gate label */}
      {lastGateLabel && (
        <p className="text-[11px] text-accent/70 font-mono truncate">
          {lastGateLabel}
        </p>
      )}

      {/* Footer: stats + timestamp */}
      <div className="flex items-center justify-between mt-1 text-[10px] text-text-muted font-mono">
        <div className="flex items-center gap-3">
          {gateCount > 0 && (
            <span className="flex items-center gap-1">
              <GateIcon />
              {gateCount}
            </span>
          )}
          {crux.meta?.messages && crux.meta.messages.length > 0 && (
            <span className="flex items-center gap-1">
              <FileIcon />
              {crux.meta.messages.filter((m) => m.toolCalls?.some((tc) => tc.name === 'write_file')).length}
            </span>
          )}
        </div>
        <span>{formatRelativeTime(crux.updated)}</span>
      </div>
    </button>
  );
}
