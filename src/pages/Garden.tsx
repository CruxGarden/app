import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuthStore } from '@/stores/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { useGarden } from '@/hooks/useGarden';
import { cruxes } from '@/api';
import { GardenGrid, GardenSearch, GardenEmpty } from '@/components/garden';
import { IconButton, Spinner, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function ImportIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

const MIME_MAP: Record<string, string> = {
  html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'application/javascript', mjs: 'application/javascript',
  ts: 'application/javascript', tsx: 'application/javascript', jsx: 'application/javascript',
  json: 'application/json', md: 'text/markdown', txt: 'text/plain',
  py: 'text/x-python', svg: 'image/svg+xml', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
  pdf: 'application/pdf', zip: 'application/zip',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
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

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingId) return;
    await deleteCrux(deletingId);
    setDeletingId(null);
  }, [deletingId, deleteCrux]);

  const handleImport = useCallback(async (file: File) => {
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
        title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') +
        '-' + Date.now().toString(36);

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
          setImportProgress(`Importing files... (${i + 1}/${artifactFiles.length})`);
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
      navigate(`/crux/${newCrux.id}`);
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import .crux file. Make sure it is a valid export.');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  }, [navigate, refresh]);

  const handleImportInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    e.target.value = '';
  }, [handleImport]);

  // Page title
  useEffect(() => {
    document.title = author ? author.username : 'Garden';
    return () => { document.title = 'crux.garden'; };
  }, [author]);

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
                <p className="text-sm text-text-muted">
                  Home Garden
                </p>
                {author && (
                  <a
                    href={`/@${author.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconButton label="Public Garden" size="sm" tooltip={{ label: 'Public Garden' }}>
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

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={32} />
        </div>
      ) : cruxList.length === 0 ? (
        <GardenEmpty
          hasSearch={search.length > 0}
          onNewCrux={handleNewCrux}
          onClearSearch={handleClearSearch}
        />
      ) : (
        <GardenGrid cruxes={cruxList} onDelete={setDeletingId} sortBy={sortBy} />
      )}

      {/* Delete confirmation modal */}
      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)}>
        <h2 className="font-display text-sm font-medium text-text mb-2">
          Delete crux
        </h2>
        <p className="text-xs text-text-muted mb-4">
          Are you sure you want to delete <span className="text-text font-medium">{deletingCrux?.title || 'this crux'}</span>?
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
