import { cn } from '@/lib/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'muted';
  className?: string;
}

const variants = {
  default: 'bg-badge text-badge-text border-badge-border',
  accent: 'bg-badge text-badge-text border-badge-border',
  muted: 'bg-surface text-surface-text-muted border-surface-border',
};

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
