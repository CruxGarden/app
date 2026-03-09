import { cn } from '@/lib/cn';
import Spinner from './Spinner';

interface LoadingPanelProps {
  label?: string;
  className?: string;
}

/**
 * Small themed panel with a centered spinner.
 * Has its own background so it's visible regardless of what's behind it.
 * Wrap in a centering container (e.g. flex items-center justify-center h-full).
 */
export default function LoadingPanel({ label, className }: LoadingPanelProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-5 py-3 rounded-lg',
        'bg-surface border border-border text-text-muted text-sm',
        className,
      )}
    >
      <Spinner size={16} />
      {label && <span className="font-mono text-xs">{label}</span>}
    </div>
  );
}
