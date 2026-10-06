import { Capability, can } from '@/lib/platform';
import { cn } from '@/lib/cn';
import AreaNavigation from './AreaNavigation';
import { isPublicSite } from '@/lib/site';
import type { ReactNode } from 'react';
import { buttonClass } from '@/components/ui/button-class';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@/lib/constants';
import { ChevronRightIcon } from '@/components/ui/icons';

/**
 * The bar across the top of a page that lives outside the Shell — Explore,
 * Plans — so it reads as the same chrome as the TopBar: the same height, the
 * same tokens, and under Plasma the same floating dock. Before this each page
 * drew its own eight-pixel strip in a different font and a flat colour.
 */
export default function PageHeader({
  title,
  children,
  area,
}: {
  title: string;
  children?: ReactNode;
  area?: 'explore';
}) {
  return (
    <header
      className={cn(
        'relative z-20 flex items-center flex-wrap justify-between gap-3 px-3 py-1 border-b border-toolbar-border bg-toolbar shrink-0',
        can(Capability.DesktopChrome) && 'pl-24',
      )}
      style={{ minHeight: 'var(--toolbar-height)' }}
    >
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        {area && <AreaNavigation area={area} />}
        <Link
          to={area ? '/explore' : '/'}
          className={buttonClass(
            'ghost',
            'xs',
            'px-2 text-sm font-display text-toolbar-text hover:text-toolbar-text',
          )}
        >
          {area ? 'Explore Home' : APP_NAME}
        </Link>
        {title !== 'Explore Home' && (
          <>
            <span className="text-toolbar-text-muted shrink-0">
              <ChevronRightIcon />
            </span>
            <span className="text-xs font-medium font-display text-toolbar-link truncate">
              {title}
            </span>
          </>
        )}
      </div>
      {area && isPublicSite() && (
        <Link to="/#download" className={buttonClass('ghost', 'xs')}>
          Get Crux Garden
        </Link>
      )}
      {children && <div className="flex items-center gap-1 shrink-0">{children}</div>}
    </header>
  );
}
