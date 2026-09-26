import { cn } from '@/lib/cn';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/**
 * A row of exclusive choices — views, sort orders, billing intervals — one
 * piece, the chosen segment lit with the accent. Buttons carry `aria-pressed`
 * so the choice reads to assistive tech and to the journeys.
 */
export default function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'sm',
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly Segment<T>[];
  /** The group's accessible name. */
  label: string;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center p-0.5 rounded-[var(--radius-sm)] bg-surface border border-border',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-[calc(var(--radius-sm)-2px)] cursor-pointer transition-colors',
              size === 'xs' ? 'px-2 py-0.5 text-xxs font-mono' : 'px-2.5 py-1 text-xs',
              active ? 'bg-accent-muted text-accent' : 'text-text-muted hover:text-text',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
