import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

const sizes = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
};

export default function IconButton({
  label,
  size = 'md',
  active,
  className,
  children,
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-sm)]',
        'transition-colors duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        active
          ? 'text-accent bg-accent-muted'
          : 'text-text-muted hover:text-text hover:bg-accent-muted',
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
