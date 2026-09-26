import { cn } from '@/lib/cn';

/** The one field style: Input, Textarea and Select share it, so every form reads as one. */
export function fieldClass(error?: string | boolean, className?: string, size: 'sm' | 'md' = 'md') {
  return cn(
    'w-full rounded-[var(--radius-sm)] font-body',
    size === 'sm' ? 'h-8 px-2 text-xs' : 'h-10 px-3 text-sm',
    'bg-input text-input-text placeholder:text-placeholder',
    'border outline-none',
    'transition-colors',
    'focus:border-input-border-active focus:ring-1 focus:ring-input-outline',
    error ? 'border-error' : 'border-input-border hover:border-input-border-hover',
    'disabled:cursor-not-allowed',
    className,
  );
}

