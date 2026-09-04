import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui';

/**
 * The shared vocabulary of the small workspace panes (Sync, Share, Export,
 * Store, Details). Each pane used to hand-roll its own empty state, status
 * card, and big action button with slightly different spacing and colors;
 * these primitives are that vocabulary written down once.
 */

interface PaneEmptyProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** An action or inline form (e.g. Connect) shown under the copy. */
  children?: ReactNode;
  className?: string;
}

/** Centered empty / gated state with room for a next step. */
export function PaneEmpty({ icon, title, description, children, className }: PaneEmptyProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center gap-2 p-5',
        className,
      )}
    >
      {icon && (
        <div className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-text-muted mb-1">
          {icon}
        </div>
      )}
      <p className="text-sm font-body text-heading">{title}</p>
      {description && (
        <p className="text-xs text-text-muted max-w-[26ch] leading-relaxed">{description}</p>
      )}
      {children && <div className="mt-2 w-full max-w-[260px]">{children}</div>}
    </div>
  );
}

interface PaneSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  label?: ReactNode;
  /** Something to the right of the label (a version, a count). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'dashed';
}

/** A labelled card — status, summaries, grouped controls. */
export function PaneSection({
  label,
  aside,
  children,
  className,
  tone = 'default',
  ...rest
}: PaneSectionProps) {
  return (
    <section
      {...rest}
      className={cn(
        'rounded-[var(--radius-sm)] border px-3 py-2.5',
        tone === 'dashed' ? 'border-dashed border-border/70' : 'border-border bg-surface/50',
        className,
      )}
    >
      {(label || aside) && (
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-2xs font-mono uppercase tracking-wider text-caption">{label}</span>
          {aside && <span className="text-xxs font-mono text-text-muted">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

interface PaneActionProps {
  onClick?: () => void;
  disabled?: boolean;
  /** Replaces the label with a spinner + this text and blocks clicks. */
  busy?: string | false | null;
  tone?: 'primary' | 'secondary';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** The pane's full-width call to action. Never a disabled-looking primary. */
export function PaneAction({
  onClick,
  disabled,
  busy,
  tone = 'primary',
  icon,
  children,
  className,
}: PaneActionProps) {
  const isBusy = !!busy;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isBusy}
      className={cn(
        'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
        'text-sm font-medium font-body transition-all',
        tone === 'primary'
          ? 'bg-accent-muted text-accent border border-accent/20'
          : 'bg-surface text-text border border-border',
        isBusy
          ? 'cursor-wait'
          : disabled
            ? 'opacity-50 cursor-not-allowed'
            : tone === 'primary'
              ? 'hover:border-accent cursor-pointer'
              : 'hover:border-accent cursor-pointer',
        className,
      )}
    >
      {isBusy ? (
        <>
          <Spinner size={14} />
          {busy}
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  );
}

/** One-line helper text under an action. */
export function PaneHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-2xs text-text-muted text-center leading-relaxed', className)}>
      {children}
    </p>
  );
}

/** Progress / error line. */
export function PaneNote({
  children,
  tone = 'muted',
  className,
}: {
  children: ReactNode;
  tone?: 'muted' | 'error';
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-xxs font-mono text-center truncate',
        tone === 'error' ? 'text-error' : 'text-text-muted',
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Header strip for panes that are list/table-shaped (Store). */
export function PaneToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-2 border-b border-border shrink-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
