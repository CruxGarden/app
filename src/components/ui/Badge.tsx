import { cn } from '@/lib/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'muted';
  className?: string;
}

const variants = {
  default: 'bg-surface-solid text-text border-border',
  accent: 'bg-accent-muted text-accent border-accent/20',
  muted: 'bg-surface text-text-muted border-border',
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
