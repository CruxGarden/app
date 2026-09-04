import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { useDismiss } from '@/hooks/useDismiss';
import { useBlobUrl } from '@/hooks/useBlobUrl';
const ExportModal = lazy(() => import('@/components/garden/ExportModal'));
import type { Crux } from '@/api/types';
import { MoreVerticalIcon } from '@/components/ui/icons';

interface CruxCardProps {
  crux: Crux;
  linkTo?: string;
  onDelete?: (id: string) => void;
  sortBy?: 'created' | 'updated';
  /** Hide the three-dot action menu (e.g. on public pages) */
  hideMenu?: boolean;
  /** Blob Store fingerprint of the crux's preview.jpg, when one has been captured. */
  thumbnailFingerprint?: string;
  /** Already-resolved image URL (public pages, where there is no Blob Store). */
  thumbnailUrl?: string;
}

const KIND_LABELS: Record<string, string> = {
  webapp: 'Site',
  page: 'Page',
  document: 'Document',
  image: 'Image',
  notes: 'Notes',
};

/** Stand-in for cruxes that have no screenshot yet: the title's initial, plain. */
function Placeholder({ crux }: { crux: Crux }) {
  const label = crux.title || crux.slug || '?';
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
      <span className="font-wordmark text-5xl leading-none text-accent/70 select-none">
        {initial}
      </span>
    </div>
  );
}

export default function CruxCard({
  crux,
  linkTo,
  onDelete,
  sortBy = 'created',
  hideMenu,
  thumbnailFingerprint,
  thumbnailUrl,
}: CruxCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const blobUrl = useBlobUrl(thumbnailFingerprint, 'image/jpeg');
  const imageUrl = thumbnailUrl || blobUrl;

  const description = crux.meta?.summary?.purpose || crux.description;
  const isPublished = crux.meta?.publishedAt != null;
  const kindLabel = crux.kind ? KIND_LABELS[crux.kind] : undefined;
  const when = sortBy === 'updated' ? crux.updated : crux.created;

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuRef, closeMenu, menuOpen);

  return (
    <div
      className={cn(
        'relative group flex flex-col rounded-[var(--radius)] overflow-hidden motion-enter-card',
        'bg-garden-card border border-garden-card-border',
        'transition-[border-color,transform,box-shadow] duration-200',
        'shadow-card hover:border-garden-card-border-hover hover:bg-garden-card-hover hover-lift hover:shadow-card-hover',
        'focus-within:border-garden-card-border-hover',
      )}
    >
      <button
        onClick={() => navigate(linkTo || `/c/${crux.id}`)}
        className="flex flex-col text-left cursor-pointer outline-none flex-1"
        aria-label={`Open ${crux.title || crux.slug}`}
      >
        {/* Thumbnail */}
        <div
          className="relative w-full bg-garden-card-thumbnail overflow-hidden border-b border-garden-card-border"
          style={{ aspectRatio: 'var(--garden-card-aspect)' }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
              draggable={false}
            />
          ) : (
            <Placeholder crux={crux} />
          )}
          {/* Badges */}
          <div className="absolute left-2 bottom-2 flex items-center gap-1.5">
            {isPublished && (
              <span className="inline-flex items-center gap-1 rounded-full bg-overlay-badge backdrop-blur-sm px-2 py-0.5 text-2xs font-mono text-overlay-badge-text">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                Shared
              </span>
            )}
            {kindLabel && (
              <span className="rounded-full bg-overlay-badge backdrop-blur-sm px-2 py-0.5 text-2xs font-mono text-overlay-badge-text">
                {kindLabel}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-1 px-3.5 pt-3 pb-3.5 flex-1 min-w-0">
          <h3 className="font-display text-sm font-medium text-garden-card-title group-hover:text-accent truncate transition-colors">
            {crux.title || crux.slug}
          </h3>
          <p
            className={cn(
              'text-xs text-garden-card-text leading-relaxed line-clamp-2 min-h-[2lh]',
              !description && 'italic opacity-70',
            )}
          >
            {description || 'No description yet'}
          </p>
          <div className="mt-auto pt-2 text-2xs font-mono text-garden-card-meta">
            {sortBy === 'updated' ? 'Updated' : 'Created'} {formatDateTime(when)}
          </div>
        </div>
      </button>

      {/* Three-dot menu */}
      {!hideMenu && (
        <div ref={menuRef} className="absolute top-2 right-2 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            aria-label="Crux actions"
            className={cn(
              'p-1.5 rounded-full bg-overlay-badge backdrop-blur-sm text-overlay-badge-text hover:brightness-125 cursor-pointer transition-opacity',
              menuOpen
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
          >
            <MoreVerticalIcon size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 w-32 bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown py-1 z-50"
            >
              <button
                role="menuitem"
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
                  role="menuitem"
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
        </div>
      )}

      {exportOpen && (
        <Suspense fallback={null}>
          <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} crux={crux} />
        </Suspense>
      )}
    </div>
  );
}
