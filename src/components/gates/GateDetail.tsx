import { cn } from '@/lib/cn';
import type { Dimension, GateSnapshot } from '@/api/types';

interface GateDetailProps {
  gate: Dimension;
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
          'font-mono text-[10px] uppercase tracking-wider',
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

export default function GateDetail({ gate, index, onClose }: GateDetailProps) {
  const title = gate.target?.title || `Snapshot ${index + 1}`;
  const snapshot = tryParseSnapshot(gate);

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-mono text-accent/70 uppercase">#{index + 1}</span>
          <h3 className="text-sm font-display font-medium text-text mt-0.5">{title}</h3>
          <span className="text-[10px] text-text-muted">
            {new Date(gate.created).toLocaleString()}
          </span>
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
          {gate.target?.data || 'No snapshot data available.'}
        </p>
      )}
    </div>
  );
}

function tryParseSnapshot(gate: Dimension): GateSnapshot | null {
  // The target embed only includes id, slug, title, data
  // The actual snapshot is in the gate crux's meta.snapshot
  // We can't access it through the embed, but if the data field
  // contains parseable snapshot text, we try that
  const data = gate.target?.data;
  if (!data) return null;

  // If it looks like structured snapshot text, try to parse
  const fields: Record<string, string> = {};
  const keys = ['state', 'decision', 'rejected', 'reason', 'artifacts', 'open'];

  for (const line of data.split('\n')) {
    const match = line.match(/^(STATE|DECISION|REJECTED|REASON|ARTIFACTS|OPEN):\s*(.+)/i);
    if (match && match[1] && match[2]) {
      fields[match[1].toLowerCase()] = match[2].trim();
    }
  }

  if (keys.every((k) => fields[k])) {
    return { gate: gate.target?.title ?? '', ...fields } as unknown as GateSnapshot;
  }

  return null;
}
