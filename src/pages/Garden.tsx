import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import MoodBar from '@/components/layout/MoodBar';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { useGarden } from '@/hooks/useGarden';
import { peekImport, importCrux, type ImportConflictInfo } from '@/services/crux-io';
import { importGarden } from '@/services/garden-io';
import { ensureLocalAuthor } from '@/services';
import { APP_NAME } from '@/lib/constants';
import { GardenGrid, GardenSearch } from '@/components/garden';
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

function ImportIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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
    handleNewCrux,
    handleClearSearch,
    deleteCrux,
    refresh,
  } = useGarden();

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

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

  // Import conflict resolution
  const [importConflict, setImportConflict] = useState<ImportConflictInfo | null>(null);
  const conflictResolverRef = useRef<((choice: 'replace' | 'clone' | 'cancel') => void) | null>(null);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteCrux(deletingId);
    setDeletingId(null);
  }, [deletingId, deleteCrux]);

  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportProgress({ done: 0, total: 0 });

      try {
        // Peek at the ZIP to check for conflicts
        const { conflict } = await peekImport(file);

        let mode: 'restore' | 'replace' | 'clone' = 'restore';
        if (conflict) {
          const choice = await new Promise<'replace' | 'clone' | 'cancel'>((resolve) => {
            conflictResolverRef.current = resolve;
            setImportConflict(conflict);
          });
          setImportConflict(null);
          conflictResolverRef.current = null;
          if (choice === 'cancel') return;
          mode = choice;
        }

        // Run the import
        const result = await importCrux({
          data: file,
          mode,
          onProgress: (done, total) => setImportProgress({ done, total }),
        });

        // Restore workspace layout (UI-specific settings)
        if (result.layout) {
          const layout = result.layout;
          if (layout.paneOrder && layout.paneVisibility) {
            setSetting(
              `cruxgarden:layout:${result.cruxId}`,
              JSON.stringify({ paneOrder: layout.paneOrder, paneVisibility: layout.paneVisibility }),
            );
          }
          if (layout.editorTabs) {
            setSetting(
              `cruxgarden:editor-tabs:${result.cruxId}`,
              JSON.stringify(layout.editorTabs),
            );
          }
          if (layout.folderState) {
            setSetting(
              `cruxgarden:folder-state:${result.cruxId}`,
              JSON.stringify(layout.folderState),
            );
          }
        }

        // Restore theme preferences
        if (result.theme) {
          if (result.theme.mode) {
            setSetting('cruxgarden:theme', result.theme.mode);
          }
          if (result.theme.tint) {
            setSetting('cruxgarden:tint', result.theme.tint);
          }
        }

        if (result.failedArtifacts.length > 0) {
          console.warn('Some artifacts failed to import:', result.failedArtifacts);
          alert(`Import completed with ${result.failedArtifacts.length} file${result.failedArtifacts.length > 1 ? 's' : ''} that could not be restored.`);
        }

        refresh();
        navigate(`/c/${result.cruxId}`);
      } catch (err) {
        console.error('Import failed:', err);
        alert(`Failed to import .crux file: ${err instanceof Error ? err.message : 'Make sure it is a valid export.'}`);
      } finally {
        setImporting(false);
        setImportProgress({ done: 0, total: 0 });
      }
    },
    [navigate, refresh],
  );

  const handleGardenImport = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        await importGarden({
          data: file,
          onProgress: (status) => setImportProgress({ done: 0, total: 0, status } as typeof importProgress),
        });

        // Re-ensure local author exists after full garden replacement
        const author = await ensureLocalAuthor();
        useAuthStore.setState({ author });

        alert('Garden imported successfully. Reload recommended.');
        refresh();
      } catch (err) {
        console.error('Garden import failed:', err);
        alert(`Failed to import .garden file: ${err instanceof Error ? err.message : 'The file may be corrupted.'}`);
      } finally {
        setImporting(false);
        setImportProgress({ done: 0, total: 0 });
      }
    },
    [refresh],
  );

  const handleImportInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.name.endsWith('.garden')) {
        handleGardenImport(file);
      } else {
        handleImport(file);
      }
      e.target.value = '';
    },
    [handleImport, handleGardenImport],
  );


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
      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".crux,.garden,.zip"
        className="hidden"
        onChange={handleImportInput}
      />

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
          <div className="flex items-center gap-1.5">
            {importing ? (
              <div className="relative w-9 h-9 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
                  <circle
                    cx="14" cy="14" r="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-border"
                  />
                  <circle
                    cx="14" cy="14" r="12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="text-accent transition-[stroke-dashoffset] duration-300"
                    strokeDasharray={2 * Math.PI * 12}
                    strokeDashoffset={
                      importProgress.total > 0
                        ? 2 * Math.PI * 12 * (1 - importProgress.done / importProgress.total)
                        : 2 * Math.PI * 12
                    }
                  />
                </svg>
                <span className="absolute text-[9px] font-mono text-text-muted">
                  {importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0}
                </span>
              </div>
            ) : (
              <IconButton
                label="Import Crux"
                size="lg"
                tooltip={{ label: 'Import Crux' }}
                onClick={() => importInputRef.current?.click()}
                className="bg-surface text-text-muted hover:bg-accent-muted hover:text-accent"
              >
                <ImportIcon />
              </IconButton>
            )}
            <IconButton
              label="New Crux"
              size="lg"
              tooltip={{ label: 'New Crux' }}
              onClick={handleNewCrux}
              className="bg-surface text-text-muted hover:bg-accent-muted hover:text-accent"
            >
              <PlusCircleIcon />
            </IconButton>
          </div>
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

      {/* Import conflict modal */}
      <Modal
        open={importConflict !== null}
        onClose={() => {
          conflictResolverRef.current?.('cancel');
          setImportConflict(null);
          conflictResolverRef.current = null;
        }}
      >
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-display font-medium text-text">Crux already exists</h2>
            <p className="text-sm text-text-muted mt-1">
              <span className="text-text font-medium">{importConflict?.title}</span>{' '}
              already exists in your garden.
            </p>
          </div>

          {importConflict && (
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface/50 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Installed</div>
                <div className="text-text">v{importConflict.installedVersion}</div>
                {importConflict.installedUpdated && (
                  <div className="text-text-muted mt-0.5">
                    {new Date(importConflict.installedUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
              <div className="rounded-[var(--radius-sm)] border border-border bg-surface/50 p-2.5">
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Incoming</div>
                <div className="text-text">v{importConflict.incomingVersion}</div>
                {importConflict.incomingUpdated && (
                  <div className="text-text-muted mt-0.5">
                    {new Date(importConflict.incomingUpdated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                conflictResolverRef.current?.('cancel');
                setImportConflict(null);
                conflictResolverRef.current = null;
              }}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                conflictResolverRef.current?.('clone');
                setImportConflict(null);
                conflictResolverRef.current = null;
              }}
            >
              Clone
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                conflictResolverRef.current?.('replace');
                setImportConflict(null);
                conflictResolverRef.current = null;
              }}
            >
              Replace
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
