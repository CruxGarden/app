import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import MoodBar from '@/components/layout/MoodBar';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { useGarden } from '@/hooks/useGarden';

import { APP_NAME } from '@/lib/constants';
import { GardenGrid, GardenSearch } from '@/components/garden';
import NewCruxModal from '@/components/garden/NewCruxModal';
import { ApiKeySetup, IconButton, Modal, Button } from '@/components/ui';
import { getApiKey } from '@/ai/keys';
import { getSetting, setSetting } from '@/services/settings';
import { cn } from '@/lib/cn';

const DISMISS_KEY = 'cruxgarden:apiKeyBannerDismissed';

function GlobeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

export default function Garden() {
  const author = useAuthStore((s) => s.author);
  const navigate = useNavigate();
  const {
    cruxList,
    loading,
    search,
    sortBy,
    setSearch,
    setSortBy,
    handleClearSearch,
    deleteCrux,
  } = useGarden();

  const [showNewCrux, setShowNewCrux] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingCrux = deletingId ? cruxList.find((c) => c.id === deletingId) : null;

  // API key banner
  const [showApiKeyBanner, setShowApiKeyBanner] = useState(false);

  useEffect(() => {
    const dismissed = !!getSetting(DISMISS_KEY);
    if (dismissed) return;
    getApiKey('anthropic').then((key) => {
      if (!key) setShowApiKeyBanner(true);
    });
  }, []);

  const handleDismissBanner = () => {
    setSetting(DISMISS_KEY, '1');
    setShowApiKeyBanner(false);
  };

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteCrux(deletingId);
    setDeletingId(null);
  }, [deletingId, deleteCrux]);

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
                {author.meta?.avatarUrl ? (
                  <img
                    src={typeof author.meta.avatarUrl === 'string' && author.meta.avatarUrl.startsWith('data:') ? author.meta.avatarUrl : `${API_BASE_URL}${author.meta.avatarUrl}?v=${author.updated}`}
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
                    onClick={() => navigate(`/${author.username}`)}
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
            className="bg-surface text-text-muted hover:bg-accent-muted hover:text-accent"
          >
            <PlusCircleIcon />
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

      {/* API key setup banner */}
      {showApiKeyBanner && (
        <div className="relative bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6">
          <button
            onClick={handleDismissBanner}
            className="absolute top-3 right-3 text-text-muted hover:text-text transition-colors cursor-pointer p-0.5"
            title="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
          <p className="text-xs text-text-muted mb-3">
            Add your Claude API key to enable AI collaboration in your cruxes.
            Your key is stored locally in this browser and never saved to our servers.
          </p>
          <ApiKeySetup compact onKeySaved={handleDismissBanner} />
        </div>
      )}

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
      ) : (
        <GardenGrid cruxes={cruxList} onDelete={setDeletingId} sortBy={sortBy} />
      )}

      <MoodBar />

      {/* Delete confirmation modal */}
      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)}>
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-display font-medium text-text">Delete crux</h2>
            <p className="text-sm text-text-muted mt-1">
              Are you sure you want to delete{' '}
              <span className="text-text font-medium">{deletingCrux?.title || 'this crux'}</span>?
              This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* New crux modal */}
      <NewCruxModal open={showNewCrux} onClose={() => setShowNewCrux(false)} />
    </div>
  );
}
