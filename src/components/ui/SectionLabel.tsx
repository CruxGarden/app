import type { ComponentProps, ElementType } from 'react';
import { cn } from '@/lib/cn';

/**
 * The small caption over a group of controls — the one style for it, so a
 * pane, a tab and a settings card all say "here begins a section" the same
 * way. Renders a span by default; pass `as` for a heading or legend.
 */
export default function SectionLabel<T extends ElementType = 'span'>({
  as,
  tone = 'caption',
  className,
  ...props
}: { as?: T; tone?: 'caption' | 'muted' | 'accent' } & Omit<ComponentProps<T>, 'as'>) {
  const Tag = (as ?? 'span') as ElementType;
  return (
    <Tag
      className={cn(
        'block text-2xs font-mono uppercase tracking-wider',
        tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-text-muted' : 'text-caption',
        className,
      )}
      {...props}
    />
  );
}
