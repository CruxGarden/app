import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuthStore } from '@/stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { useGarden } from '@/hooks/useGarden';
import { cruxes } from '@/api';
import { APP_NAME } from '@/lib/constants';
import { GardenGrid, GardenSearch } from '@/components/garden';
import { ApiKeySetup, IconButton, Spinner, Modal } from '@/components/ui';
import { API_KEY_STORAGE } from '@/components/ui/ApiKeySetup';
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

const MIME_MAP: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  mjs: 'application/javascript',
  ts: 'application/javascript',
  tsx: 'application/javascript',
  jsx: 'application/javascript',
  json: 'application/json',
  md: 'text/markdown',
  txt: 'text/plain',
  py: 'text/x-python',
  svg: 'image/svg+xml',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function guessMime(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return MIME_MAP[ext] || 'application/octet-stream';
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
  const [showApiKeyBanner, setShowApiKeyBanner] = useState(() => {
    const hasKey = !!localStorage.getItem(API_KEY_STORAGE);
    const dismissed = !!localStorage.getItem(DISMISS_KEY);
    return !hasKey && !dismissed;
  });

  const handleDismissBanner = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShowApiKeyBanner(false);
  };

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [, setImportProgress] = useState('');

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteCrux(deletingId);
    setDeletingId(null);
  }, [deletingId, deleteCrux]);

  const handleImport = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportProgress('Reading file...');

      try {
        const zip = await JSZip.loadAsync(file);

        // Read crux.json
        const cruxJsonFile = zip.file('crux.json');
        if (!cruxJsonFile) {
          alert('Invalid .crux file: missing crux.json');
          return;
        }
        const cruxData = JSON.parse(await cruxJsonFile.async('text'));

        // Generate fresh slug
        const title = cruxData.title || 'Imported Crux';
        const slug =
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') +
          '-' +
          Date.now().toString(36);

        // Create new crux
        setImportProgress('Creating crux...');
        const newCrux = await cruxes.create({
          slug,
          title,
          type: 'workspace',
          data: cruxData.description || '',
          meta: {
            messages: [],
            summary: cruxData.summary || null,
            settings: cruxData.settings || { model: 'claude-sonnet-4-20250514' },
          },
        });

        // Read and save messages
        const messagesFile = zip.file('messages.json');
        if (messagesFile) {
          setImportProgress('Restoring messages...');
          const messages = JSON.parse(await messagesFile.async('text'));
          await cruxes.update(newCrux.id, {
            meta: {
              ...newCrux.meta,
              messages,
              summary: cruxData.summary || null,
              gateCount: 0,
            },
          });
        }

        // Upload artifact files
        const artifactFiles: { path: string; zipEntry: JSZip.JSZipObject }[] = [];
        zip.folder('artifacts')?.forEach((relativePath, entry) => {
          if (!entry.dir) {
            artifactFiles.push({ path: relativePath, zipEntry: entry });
          }
        });

        if (artifactFiles.length > 0) {
          for (let i = 0; i < artifactFiles.length; i++) {
            const { path, zipEntry } = artifactFiles[i]!;
            setImportProgress(`Importing artifacts... (${i + 1}/${artifactFiles.length})`);
            try {
              const blob = await zipEntry.async('blob');
              const filename = path.split('/').pop() || 'file';
              const mime = guessMime(filename);
              const fileObj = new File([blob], filename, { type: mime });
              await cruxes.uploadAttachment(newCrux.id, fileObj, {
                path,
                type: 'file',
                kind: 'artifact',
              });
            } catch (err) {
              console.warn(`Failed to import: ${path}`, err);
            }
          }
        }

        setImportProgress('');
        refresh();
        navigate(`/c/${newCrux.id}`);
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to import .crux file. Make sure it is a valid export.');
      } finally {
        setImporting(false);
        setImportProgress('');
      }
    },
    [navigate, refresh],
  );

  const handleImportInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImport(file);
      e.target.value = '';
    },
    [handleImport],
  );

  // Background type toggle (persisted)
  const BG_STORAGE_KEY = 'cruxgarden:backgroundType';
  const [bgType, setBgType] = useState<string>(() => {
    return localStorage.getItem(BG_STORAGE_KEY) || 'bloom';
  });

  // Apply saved preference on mount
  useEffect(() => {
    const saved = localStorage.getItem(BG_STORAGE_KEY);
    if (saved && saved !== 'bloom') {
      document.documentElement.style.setProperty('--background-type', saved);
    }
  }, []);

  const toggleBg = useCallback((type: string) => {
    document.documentElement.style.setProperty('--background-type', type);
    setBgType(type);
    localStorage.setItem(BG_STORAGE_KEY, type);
  }, []);

  // Page title
  useEffect(() => {
    document.title = author ? author.username : 'Garden';
    return () => {
      document.title = APP_NAME;
    };
  }, [author]);

  if (loading) {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".crux,.zip"
        className="hidden"
        onChange={handleImportInput}
      />

      {/* Header + Search panel */}
      <div className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {author && (
              <div className="w-12 h-12 rounded-full overflow-hidden flex items-center justify-center shrink-0 bg-accent-muted">
                {author.meta?.avatarUrl ? (
                  <img
                    src={`${API_BASE_URL}${author.meta.avatarUrl}?v=${author.updated}`}
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
                  <a href={`/${author.username}`} target="_blank" rel="noopener noreferrer">
                    <IconButton
                      label="Public Garden"
                      size="sm"
                      tooltip={{ label: 'Public Garden' }}
                    >
                      <GlobeIcon />
                    </IconButton>
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <IconButton
              label="Import Crux"
              size="lg"
              tooltip={{ label: 'Import Crux' }}
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="bg-surface text-text-muted hover:bg-accent-muted hover:text-accent"
            >
              <ImportIcon />
            </IconButton>
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

      {/* Background toggle — bottom right */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-1 p-1 rounded-[var(--radius)] bg-panel border border-border">
        <div className="relative group/bloom">
          <button
            onClick={() => toggleBg('bloom')}
            className={cn(
              'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              bgType === 'bloom' ? 'text-text bg-surface' : 'text-text-muted hover:text-text hover:bg-surface',
            )}
          >
            <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
              <circle cx="6" cy="5" r="4" fill="var(--accent)" opacity="0.4" />
              <circle cx="14" cy="9" r="4" fill="var(--accent)" opacity="0.25" />
              <circle cx="10" cy="4" r="3" fill="var(--accent)" opacity="0.15" />
            </svg>
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/bloom:block">
            <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
              <span className="text-xs font-medium text-text">Bloom</span>
            </div>
          </div>
        </div>
        <div className="relative group/flow">
          <button
            onClick={() => toggleBg('flowfield')}
            className={cn(
              'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              bgType === 'flowfield' ? 'text-text bg-surface' : 'text-text-muted hover:text-text hover:bg-surface',
            )}
          >
            <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
              <path d="M2 8 C5 4, 8 4, 10 7 S15 12, 18 8" stroke="var(--accent)" strokeWidth="0.8" fill="none" opacity="0.6" />
              <path d="M1 11 C4 7, 7 6, 10 9 S14 14, 19 10" stroke="var(--accent)" strokeWidth="0.6" fill="none" opacity="0.35" />
              <path d="M3 5 C6 2, 9 2, 12 5 S16 9, 19 5" stroke="var(--accent)" strokeWidth="0.6" fill="none" opacity="0.4" />
            </svg>
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/flow:block">
            <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
              <span className="text-xs font-medium text-text">Flow</span>
            </div>
          </div>
        </div>
        <div className="relative group/drift">
          <button
            onClick={() => toggleBg('drift')}
            className={cn(
              'p-1.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
              bgType === 'drift' ? 'text-text bg-surface' : 'text-text-muted hover:text-text hover:bg-surface',
            )}
          >
            <svg width="18" height="14" viewBox="0 0 20 14" className="shrink-0">
              <circle cx="4" cy="3" r="1" fill="var(--accent)" opacity="0.7" />
              <circle cx="16" cy="11" r="0.8" fill="var(--accent)" opacity="0.5" />
              <circle cx="10" cy="7" r="1.5" fill="var(--accent)" opacity="0.4" />
              <circle cx="14" cy="4" r="0.6" fill="var(--accent)" opacity="0.3" />
              <circle cx="7" cy="10" r="0.7" fill="var(--accent)" opacity="0.5" />
              <circle cx="17" cy="7" r="0.5" fill="var(--accent)" opacity="0.2" />
              <circle cx="3" cy="8" r="0.4" fill="var(--accent)" opacity="0.25" />
            </svg>
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none hidden group-hover/drift:block">
            <div className="px-2.5 py-1.5 rounded-[var(--radius)] bg-surface-solid border border-border shadow-lg whitespace-nowrap">
              <span className="text-xs font-medium text-text">Drift</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)}>
        <h2 className="font-display text-sm font-medium text-text mb-2">Delete crux</h2>
        <p className="text-xs text-text-muted mb-4">
          Are you sure you want to delete{' '}
          <span className="text-text font-medium">{deletingCrux?.title || 'this crux'}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDeletingId(null)}
            className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDelete}
            className={cn(
              'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
              'bg-error text-bg hover:brightness-110 transition-all cursor-pointer',
            )}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}
