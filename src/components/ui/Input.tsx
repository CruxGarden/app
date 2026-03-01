import { type InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ error, className, ...props }, ref) => {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={ref}
        className={cn(
          'h-10 w-full rounded-[var(--radius-sm)] px-3 text-sm font-body',
          'bg-surface-solid text-text placeholder:text-text-muted',
          'border outline-none',
          'transition-colors duration-150',
          'focus:border-accent focus:ring-1 focus:ring-accent/30',
          error ? 'border-error' : 'border-border',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
      {error ? <p className="text-xs text-error">{error}</p> : null}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;
