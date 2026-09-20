import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@/lib/constants';
import { ChevronRightIcon } from '@/components/ui/icons';

/**
 * The bar across the top of a page that lives outside the Shell — Explore,
 * Plans — so it reads as the same chrome as the TopBar: the same height, the
 * same tokens, and under Plasma the same floating dock. Before this each page
 * drew its own eight-pixel strip in a different font and a flat colour.
 */
export default function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header
      className="relative z-20 flex items-center justify-between gap-3 px-3 border-b border-toolbar-border bg-toolbar shrink-0"
      style={{ height: 'var(--toolbar-height)' }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Link
          to="/"
          className="shrink-0 text-sm font-display font-medium text-toolbar-text whitespace-nowrap px-2 py-1 rounded-[var(--radius-sm)] hover:bg-action-button-hover"
        >
          {APP_NAME}
        </Link>
        <span className="text-toolbar-text-muted shrink-0">
          <ChevronRightIcon />
        </span>
        <span className="text-xs font-medium font-display text-toolbar-link truncate">{title}</span>
      </div>
      {children && <div className="flex items-center gap-1 shrink-0">{children}</div>}
    </header>
  );
}
