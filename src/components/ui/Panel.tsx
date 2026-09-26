import { type ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** `ref` is an ordinary prop (React 19) so callers can reach the panel element. */
interface PanelProps extends ComponentProps<'div'> {
  padding?: 'sm' | 'md' | 'lg' | 'none';
  /** A landmark element instead of a div (a `section` with an aria-label). */
  as?: 'div' | 'section' | 'article';
}

const paddings = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-8',
};

export default function Panel({
  padding = 'md',
  as: Tag = 'div',
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <Tag
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
    </Tag>
  );
}
