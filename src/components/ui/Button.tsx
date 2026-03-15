import { type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary-button text-primary-button-text border border-primary-button-border hover:bg-primary-button-hover active:brightness-95',
  secondary:
    'bg-action-button text-action-button-text border border-action-button-border hover:bg-action-button-hover hover:text-action-button-text-hover active:brightness-95',
  ghost:
    'bg-transparent text-action-button-text hover:bg-action-button-hover hover:text-action-button-text-hover active:brightness-95',
  danger:
    'bg-danger-button text-danger-button-text border border-danger-button-border hover:bg-danger-button-hover active:brightness-95',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2.5',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium rounded-[var(--radius-sm)]',
        'transition-all duration-150 cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        'font-body',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}
