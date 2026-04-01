import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
const ExportModal = lazy(() => import('@/components/garden/ExportModal'));
import type { Crux } from '@/api/types';

interface CruxCardProps {
  crux: Crux;
  linkTo?: string;
  onDelete?: (id: string) => void;
  sortBy?: 'created' | 'updated';
  /** Hide the three-dot action menu (e.g. on public pages) */
  hideMenu?: boolean;
}

function MoreIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date}, ${time}`;
}

export default function CruxCard({ crux, linkTo, onDelete, sortBy = 'created', hideMenu }: CruxCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const description = crux.meta?.summary?.purpose || crux.description;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="relative group last:border-b-0 border-b border-border">
      <button
        onClick={() => navigate(linkTo || `/c/${crux.id}`)}
        className={cn("w-full pl-4 py-3 text-left hover:bg-accent-muted/30 cursor-pointer group/row flex items-center gap-3", hideMenu ? 'pr-4' : 'pr-10')}
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-sm font-medium text-text group-hover/row:text-accent truncate">
            {crux.title || crux.slug}
          </h3>
          {description && (
            <p className="text-xs text-text-muted truncate">{description}</p>
          )}
        </div>
        <div className="text-[10px] text-text-muted font-mono shrink-0">
          {sortBy === 'updated'
            ? formatDateTime(crux.updated)
            : formatDateTime(crux.created)}
        </div>
      </button>

      {/* Three-dot menu */}
      {!hideMenu && <div ref={menuRef} className="absolute top-1/2 -translate-y-1/2 right-2 z-10">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className={cn(
            'p-1 rounded text-text-muted hover:text-text hover:bg-surface cursor-pointer',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <MoreIcon />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-32 bg-surface-solid border border-border rounded-[var(--radius-sm)] shadow-xl py-1 z-50">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setExportOpen(true);
              }}
              className="w-full px-3 py-1.5 text-left text-xs text-text hover:bg-accent-muted transition-colors cursor-pointer"
            >
              Export...
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  onDelete(crux.id);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-error hover:bg-error-muted transition-colors cursor-pointer"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>}

      {exportOpen && (
        <Suspense fallback={null}>
          <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} crux={crux} />
        </Suspense>
      )}
    </div>
  );
}
