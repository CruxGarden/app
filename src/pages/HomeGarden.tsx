import { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useAvatarUrl } from '@/hooks/useAvatarUrl';
import { useGarden } from '@/hooks/useGarden';
import { useGardenStore } from '@/stores/gardenStore';

import { APP_NAME } from '@/lib/constants';
import { GardenGrid, GardenSearch } from '@/components/garden';
import NewCruxModal from '@/components/garden/NewCruxModal';
import RecoverSection from '@/components/garden/RecoverSection';
import TrashSection from '@/components/garden/TrashSection';
import { TRASH_RETENTION_DAYS } from '@/stores/gardenStore';
import { openGardenPage } from '@/lib/public-url';
import { IconButton, Modal, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { GlobeIcon, PlusCircleIcon } from '@/components/ui/icons';
import { useAuthStore } from '@/stores/authStore';
import * as cruxesApi from '@/api/cruxes';

export default function HomeGarden() {
  const author = useAppStore((s) => s.author);
  const avatarUrl = useAvatarUrl(author);
  const { cruxList, loading, search, sortBy, setSearch, setSortBy, handleClearSearch, deleteCrux } =
    useGarden();

  const thumbnails = useGardenStore((s) => s.thumbnails);
  const [showNewCrux, setShowNewCrux] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const deletingCrux = deletingId ? cruxList.find((c) => c.id === deletingId) : null;
  // A published crux deleted here would keep serving with nothing left to manage it
  // (RESILIENCE-PLAN §3 scenario 3): offer to take it offline in the same breath.
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const deletingPublished = !!deletingCrux?.meta?.publishedAt && isAuthenticated;
  const [alsoUnshare, setAlsoUnshare] = useState(true);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingId) return;
    try {
      if (deletingPublished && alsoUnshare) await cruxesApi.unpublish(deletingId);
      await deleteCrux(deletingId);
      setDeletingId(null);
    } catch (error) {
      setDeleteError((error as Error).message);
    }
  }, [deletingId, deleteCrux, deletingPublished, alsoUnshare]);

  // Page title
  useEffect(() => {
    document.title = author ? author.username : 'Garden';
    return () => {
      document.title = APP_NAME;
    };
  }, [author]);

  if (loading) return null;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Header + Search panel */}
      <div className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {author && (
              <div className="w-12 h-12 rounded-[var(--radius)] overflow-hidden flex items-center justify-center shrink-0 bg-accent-muted ring-1 ring-text-muted/20">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={author.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-medium text-accent">
                    {author.username?.charAt(0)?.toUpperCase() ?? '?'}
                  </span>
                )}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="font-display text-lg font-medium text-text truncate">
                {author ? author.username : 'Garden'}
              </h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-sm text-text-muted">Home Garden</p>
                {author && (
                  <IconButton
                    label="Public Garden"
                    size="sm"
                    tooltip={{ label: 'Public Garden' }}
                    onClick={() => void openGardenPage(`/${author.username}`)}
                  >
                    <GlobeIcon />
                  </IconButton>
                )}
              </div>
            </div>
          </div>
          <IconButton
            label="Add Crux"
            size="lg"
            tooltip={{ label: 'Add Crux' }}
            onClick={() => setShowNewCrux(true)}
            className="bg-panel text-text-muted hover:bg-accent/20 hover:text-accent"
          >
            <PlusCircleIcon size={20} />
          </IconButton>
        </div>
        <div className="flex items-center gap-3 mt-6">
          <div className="flex-1">
            <GardenSearch value={search} onChange={setSearch} />
          </div>
          <div className="flex items-center gap-1 text-xs font-mono text-text-muted shrink-0">
            <span>Sort by</span>
            <button
              onClick={() => setSortBy('created')}
              className={cn(
                'px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                sortBy === 'created' ? 'text-text bg-surface' : 'hover:text-text',
              )}
            >
              Created
            </button>
            <button
              onClick={() => setSortBy('updated')}
              className={cn(
                'px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                sortBy === 'updated' ? 'text-text bg-surface' : 'hover:text-text',
              )}
            >
              Updated
            </button>
          </div>
        </div>
      </div>

      {/* Cruxes the account has and this machine does not (RESILIENCE-PLAN §2c) */}
      <RecoverSection />

      {/* Content */}
      {cruxList.length === 0 && search.length > 0 ? (
        <div className="bg-panel border border-border rounded-[var(--radius)] flex flex-col items-center py-10">
          <p className="text-sm text-text-muted mb-3">No cruxes match your search</p>
          <button
            onClick={handleClearSearch}
            className="text-sm text-accent hover:text-text transition-colors cursor-pointer"
          >
            Clear search
          </button>
        </div>
      ) : cruxList.length === 0 ? (
        <div className="bg-panel border border-border rounded-[var(--radius)] flex flex-col items-center text-center py-14 px-6">
          <div className="w-12 h-12 rounded-full bg-accent-muted text-accent flex items-center justify-center mb-4">
            <PlusCircleIcon size={20} />
          </div>
          <p className="font-display text-base text-text mb-1">Your garden is empty</p>
          <p className="text-sm text-text-muted max-w-[34ch] mb-5">
            Start from a template or a blank page and talk to the AI to grow it.
          </p>
          <Button onClick={() => setShowNewCrux(true)}>Plant your first crux</Button>
        </div>
      ) : (
        <GardenGrid
          cruxes={cruxList}
          onDelete={(id) => {
            setDeleteError('');
            setDeletingId(id);
          }}
          sortBy={sortBy}
          thumbnails={thumbnails}
        />
      )}

      {/* The Trash: deleted cruxes wait here, restorable, until purged */}
      <TrashSection />

      {/* Delete confirmation modal */}
      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)} title="Delete Crux">
        <p className="text-sm text-text-muted mb-4">
          Are you sure you want to delete{' '}
          <span className="text-text font-medium">{deletingCrux?.title || 'this crux'}</span>? It
          moves to Recently deleted, where you can restore it for {TRASH_RETENTION_DAYS} days. Its
          files stay in its Project Folder on disk.
        </p>
        {deletingPublished && (
          <label className="flex items-start gap-2 text-xs text-text-muted mb-4 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alsoUnshare}
              onChange={(e) => setAlsoUnshare(e.target.checked)}
              className="accent-accent mt-0.5"
            />
            <span>
              Also take it offline. Untick to keep the published site up — it will then be listed
              under “In your account, not on this machine”, where you can recover or unshare it.
            </span>
          </label>
        )}
        {deleteError && (
          <p role="alert" className="text-sm text-error mb-3">
            {deleteError}
          </p>
        )}
        <div className="flex justify-end">
          <Button variant="danger" onClick={handleConfirmDelete}>
            Delete
          </Button>
        </div>
      </Modal>

      {/* New crux modal */}
      <NewCruxModal open={showNewCrux} onClose={() => setShowNewCrux(false)} />
    </div>
  );
}
