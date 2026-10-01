import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /** Ids of the title and description elsewhere on the page, when the switch has no label of its own. */
  labelledBy?: string;
  describedBy?: string;
}

export default function Toggle({
  checked,
  onChange,
  label,
  disabled,
  labelledBy,
  describedBy,
}: ToggleProps) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none max-w-full',
        disabled && 'cursor-not-allowed',
      )}
    >
      <button
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'toggle-switch relative rounded-full shrink-0 cursor-pointer border border-toggle-border',
          'transition-[background-color,border-color,box-shadow] hover-bright',
          'hover:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_16%,transparent)]',
          'disabled:cursor-not-allowed disabled:hover:shadow-none',
          checked ? 'bg-toggle-active' : 'bg-toggle',
        )}
        style={{ width: 'var(--toggle-width)', height: 'var(--toggle-height)' }}
      >
        <span
          className={cn(
            'toggle-thumb absolute top-[2px] left-[2px] rounded-full',
            checked ? 'bg-toggle-thumb-active' : 'bg-toggle-thumb',
          )}
          style={{
            width: 'calc(var(--toggle-height) - 4px + var(--toggle-stretch))',
            height: 'calc(var(--toggle-height) - 4px)',
            transform: checked
              ? 'translateX(calc(var(--toggle-width) - var(--toggle-height) - var(--toggle-stretch)))'
              : undefined,
          }}
        />
      </button>
      {label && <span className="text-xs text-text-muted min-w-0">{label}</span>}
    </label>
  );
}
