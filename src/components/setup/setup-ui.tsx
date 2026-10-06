import { useId, useState, type ReactNode } from 'react';
import { CheckIcon, ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/** The gentle default on a screen. */
export function Recommended() {
  return (
    <span className="inline-flex items-center h-5 px-1.5 rounded-chip border border-accent text-accent text-2xs font-mono uppercase tracking-wider whitespace-nowrap">
      Recommended
    </span>
  );
}

/** A tick that arrives on the Mood's card enter when something is ready. */
export function ReadyMark({ label }: { label?: string }) {
  return (
    <span
      className="motion-enter-card inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full bg-accent text-bg"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <CheckIcon size={12} />
    </span>
  );
}

/** "Looking…": a small breathing dot while something is checked. Still when motion is off. */
export function Looking() {
  return (
    <span
      aria-hidden
      className="motion-attention inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle mr-1.5"
    />
  );
}

/**
 * A quiet "More options" / "For developers" fold: one line until opened.
 * Controlled when `open` is given (the wizard remembers it), otherwise its own.
 */
export function Disclosure({
  label,
  hint,
  open: controlled,
  onToggle,
  children,
  testId,
}: {
  label: string;
  hint?: string;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
  testId?: string;
}) {
  const [own, setOwn] = useState(false);
  const open = controlled ?? own;
  const bodyId = useId();
  return (
    <div className="flex flex-col gap-2" data-testid={testId} data-open={open ? 'true' : 'false'}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOwn(!open);
          onToggle?.(!open);
        }}
        className={cn(
          'self-start inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 -mx-1.5',
          'text-xs text-text-muted hover:text-text hover:bg-action-button-hover cursor-pointer',
          'transition-[color,background-color] motion-press',
        )}
      >
        <ChevronDownIcon
          size={12}
          className={cn('transition-transform', open ? 'rotate-0' : '-rotate-90')}
        />
        <span>{label}</span>
        {hint && !open && <span className="text-text-muted">· {hint}</span>}
      </button>
      {open && (
        <div id={bodyId} className="motion-enter-dropdown flex flex-col gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
