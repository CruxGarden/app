import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import type { Dimension, GrowthSnapshot } from '@/api/types';

interface GrowthDetailProps {
  growth: Dimension;
  index: number;
  onClose: () => void;
}

function SnapshotField({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'font-mono text-2xs uppercase tracking-wider',
          accent ? 'text-accent' : 'text-text-muted',
        )}
      >
        {label}
      </span>
      <span className="text-sm text-text leading-relaxed">{value}</span>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

export default function GrowthDetail({ growth, index, onClose }: GrowthDetailProps) {
  const title = growth.target?.title || `Snapshot ${index + 1}`;
  const snapshot = tryParseSnapshot(growth);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-xxs font-mono text-accent/70 uppercase">#{index + 1}</span>
          <h3 className="text-sm font-display font-medium text-text mt-0.5">{title}</h3>
          <span className="text-2xs text-text-muted">{formatDateTime(growth.created)}</span>
        </div>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text transition-colors p-1 cursor-pointer"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Snapshot fields */}
      {snapshot ? (
        <div className="flex flex-col gap-2.5">
          <SnapshotField label="State" value={snapshot.state} />
          <SnapshotField label="Decision" value={snapshot.decision} accent />
          <SnapshotField label="Rejected" value={snapshot.rejected} />
          <SnapshotField label="Reason" value={snapshot.reason} />
          <SnapshotField label="Artifacts" value={snapshot.artifacts} />
          <SnapshotField label="Open" value={snapshot.open} />
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          {growth.target?.data || 'No snapshot data available.'}
        </p>
      )}
    </div>
  );
}

function tryParseSnapshot(growth: Dimension): GrowthSnapshot | null {
  const data = growth.target?.data;
  if (!data) return null;

  const fields: Record<string, string> = {};
  const keys = ['state', 'decision', 'rejected', 'reason', 'artifacts', 'open'];

  for (const line of data.split('\n')) {
    const match = line.match(/^(STATE|DECISION|REJECTED|REASON|ARTIFACTS|OPEN):\s*(.+)/i);
    if (match && match[1] && match[2]) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }
  }

  if (keys.every((k) => fields[k])) {
    return { title: growth.target?.title ?? '', ...fields } as unknown as GrowthSnapshot;
  }

  return null;
}
