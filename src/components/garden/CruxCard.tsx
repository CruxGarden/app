import { getSqliteClient } from '@/services/sqlite/client';
import { useAiEnabled } from '@/hooks/useAiEnabled';
import { alertDialog } from '@/stores/dialogStore';
import { useGardenStore } from '@/stores/gardenStore';
import { cruxPath, gardenPath, useGardenContext } from '@/stores/gardenContext';
import { useState, useRef, useCallback, lazy, Suspense } from 'react';
import PlasmaOverlay from '@/components/plasma/PlasmaOverlay';
import { Link } from 'react-router-dom';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { cn } from '@/lib/cn';
import { linkClass, menuItemClass } from '@/components/ui/button-class';
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
  tendingCount?: number;
  /** Where the card sits in its grid: cards settle one after another as a garden opens. */
  enterIndex?: number;
}

const KIND_LABELS: Record<string, string> = {
  webapp: 'Site',
  page: 'Page',
  document: 'Document',
  image: 'Image',
  notes: 'Notes',
  garden: 'Garden',
};

/** Stand-in for cruxes that have no screenshot yet: the title's initial, plain. */
function Placeholder({ crux }: { crux: Crux }) {
  const label = crux.title || crux.slug || '?';
  const initial = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <div className="absolute inset-0 flex items-center justify-center" aria-hidden>
      <span className="font-display text-5xl leading-none text-accent/70 select-none">
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
  tendingCount,
  enterIndex,
}: CruxCardProps) {
  const garden = useGardenContext((s) => s.garden);
  const navigate = useMoodNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const duplicate = async () => {
    if (copyStatus) return;
    const origin = window.location.href;
    const gardenId = garden?.id;
    setMenuOpen(false);
    setCopyStatus('Preparing copy…');
    try {
      const { duplicateCrux } = await import('@/services/duplicate-crux');
      const copy = await duplicateCrux(crux.id, gardenId, setCopyStatus);
      await useGardenStore.getState().refresh();
      if (window.location.href === origin) navigate(cruxPath(copy, gardenId));
    } catch (error) {
      await alertDialog((error as Error).message, 'Could not duplicate Crux');
    } finally {
      setCopyStatus('');
    }
  };
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const blobUrl = useBlobUrl(thumbnailFingerprint, 'image/jpeg');
  const imageUrl = thumbnailUrl || blobUrl;

  // The written summary is the collaborator's; with AI tools off, only the person's words show.
  const aiEnabled = useAiEnabled();
  const description = (aiEnabled && crux.meta?.summary?.purpose) || crux.description;
  const isPublished = crux.meta?.publishedAt != null;
  const kindLabel = crux.kind ? KIND_LABELS[crux.kind] : undefined;
  const when = sortBy === 'updated' ? crux.updated : crux.created;

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDismiss(menuRef, closeMenu, menuOpen);
  const actionsRef = useRef<HTMLDivElement>(null);

  return (
    <div
      style={
        enterIndex !== undefined
          ? ({ '--enter-index': enterIndex } as React.CSSProperties)
          : undefined
      }
      className={cn(
        'relative group shape-card flex flex-col rounded-[var(--radius)] overflow-hidden motion-enter-card',
        'bg-garden-card border border-garden-card-border',
        'transition-[border-color,transform,box-shadow] duration-200',
        'shadow-card hover:border-garden-card-border-hover hover:bg-garden-card-hover hover-lift hover:shadow-card-hover',
        'focus-within:border-garden-card-border-hover',
      )}
    >
      <button
        onClick={(e) => {
          // The title travels to the breadcrumb (View Transitions, ADR 0041): only the card
          // being opened carries the name, set before the old screen is captured.
          const title = e.currentTarget.querySelector('h3');
          if (title) title.style.viewTransitionName = `crux-${crux.id}`;
          navigate(linkTo || (crux.kind === 'garden' ? gardenPath(crux.id) : `/c/${crux.id}`));
        }}
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
              !description && 'italic text-subtle',
            )}
          >
            {description || 'No description yet'}
          </p>
          <div className="mt-auto pt-2 text-xxs font-mono text-garden-card-meta">
            {sortBy === 'updated' ? 'Updated' : 'Created'} {formatDateTime(when)}
          </div>
        </div>
      </button>

      {!!tendingCount && (
        <Link to="/tending" className={linkClass('mx-3.5 mb-3 -mt-1 self-start text-xs')}>
          {tendingCount} {tendingCount === 1 ? 'needs' : 'need'} tending
        </Link>
      )}

      {/* Three-dot menu */}
      {!hideMenu && (
        <div ref={menuRef} className="absolute top-2 right-2 z-10" data-plasma-host>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            disabled={!!copyStatus}
            aria-label="Crux actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="reveal-on-hover p-1.5 rounded-full bg-overlay-badge backdrop-blur-sm text-overlay-badge-text hover-bright active-dim motion-press cursor-pointer"
          >
            <MoreVerticalIcon size={14} />
          </button>
          {menuOpen && (
            <PlasmaOverlay
              surfaces={[{ ref: actionsRef, radius: 12, elevation: 0.6 }]}
              zIndex={-1}
              canvasStyle={{ position: 'fixed' }}
            />
          )}
          {menuOpen && (
            <div
              ref={actionsRef}
              role="menu"
              className="absolute right-0 top-full mt-1 w-40 p-1 bg-dropdown border border-dropdown-border rounded-dropdown shadow-dropdown z-50 motion-enter-dropdown"
            >
              <button
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setExportOpen(true);
                }}
                className={menuItemClass('default', 'text-xs')}
              >
                Export...
              </button>
              {onDelete && crux.kind !== 'garden' && (
                <button
                  role="menuitem"
                  className={menuItemClass('default', 'text-xs')}
                  onClick={(e) => {
                    e.stopPropagation();
                    void duplicate();
                  }}
                >
                  Duplicate
                </button>
              )}
              {onDelete && garden && (
                <button
                  role="menuitem"
                  className={menuItemClass('default', 'text-xs')}
                  onClick={(e) => {
                    e.stopPropagation();
                    const gardenId = garden.id;
                    setMenuOpen(false);
                    void getSqliteClient()
                      .gardenMembership!.remove(gardenId, crux.id)
                      .then(() => useGardenStore.getState().refresh())
                      .catch((error) =>
                        alertDialog((error as Error).message, 'Could not remove Crux'),
                      );
                  }}
                >
                  Remove from Garden
                </button>
              )}
              {onDelete && (
                <button
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(crux.id);
                  }}
                  className={menuItemClass('danger', 'text-xs')}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {copyStatus && (
        <p role="status" className="px-3 pb-3 text-xs text-text-muted">
          {copyStatus}
        </p>
      )}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} crux={crux} />
        </Suspense>
      )}
    </div>
  );
}
