import { cn } from '@/lib/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export default function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative rounded-full shrink-0 cursor-pointer border border-toggle-border transition-colors',
          checked ? 'bg-toggle-active' : 'bg-toggle',
        )}
        style={{ width: 'var(--toggle-width)', height: 'var(--toggle-height)' }}
      >
        <span
          className={cn(
            'absolute top-[2px] left-[2px] rounded-full transition-transform',
            checked ? 'bg-toggle-thumb-active' : 'bg-toggle-thumb',
          )}
          style={{
            width: 'calc(var(--toggle-height) - 4px)',
            height: 'calc(var(--toggle-height) - 4px)',
            transform: checked
              ? 'translateX(calc(var(--toggle-width) - var(--toggle-height)))'
              : undefined,
          }}
        />
      </button>
      {label && <span className="text-xs text-text-muted">{label}</span>}
    </label>
  );
}
