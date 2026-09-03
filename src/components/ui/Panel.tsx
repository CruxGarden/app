import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

export default function Panel({ padding = 'md', className, children, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'bg-panel text-panel-text',
        'border border-panel-border rounded-[var(--radius)]',
        'shadow-panel',
        paddings[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
