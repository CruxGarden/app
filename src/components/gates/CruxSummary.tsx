import { cn } from '@/lib/cn';
import type { CruxSummary as CruxSummaryType } from '@/api/types';

interface CruxSummaryProps {
  summary: CruxSummaryType;
  className?: string;
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-accent font-mono text-[11px] uppercase tracking-wider shrink-0 w-16 pt-0.5">
        {label}
      </span>
      <span className="text-text-muted text-sm leading-relaxed">{value}</span>
    </div>
  );
}

export default function CruxSummary({ summary, className }: CruxSummaryProps) {
  return (
    <div
      className={cn(
        'bg-surface/50 border border-border rounded-[var(--radius-sm)] p-3',
        'flex flex-col gap-1.5',
        className,
      )}
    >
      <div className="text-text font-display text-sm font-medium mb-0.5">
        {summary.crux}
      </div>
      <SummaryField label="Purpose" value={summary.purpose} />
      <SummaryField label="Stage" value={summary.stage} />
      <SummaryField label="Themes" value={summary.themes} />
      <SummaryField label="Stack" value={summary.stack} />
    </div>
  );
}
