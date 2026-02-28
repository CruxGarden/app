import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuthStore } from '@/stores/authStore';
import { useGarden } from '@/hooks/useGarden';
import { cruxes } from '@/api';
import { GardenGrid, GardenSearch, GardenEmpty } from '@/components/garden';
import { Button, Spinner, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';

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
    totalPages,
    currentPage,
    setSearch,
    goToPage,
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
    document.title = author ? `@${author.username}` : 'Garden';
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

      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-text truncate">
            {author ? `@${author.username}` : 'Garden'}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-text-muted">
              Your cruxes and creative history
            </p>
            {author && (
              <a
                href={`/@${author.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-accent hover:underline"
              >
                View public
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => importInputRef.current?.click()}
            loading={importing}
          >
            {importing ? importProgress || 'Importing...' : 'Import'}
          </Button>
          <Button onClick={handleNewCrux}>New Crux</Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <GardenSearch value={search} onChange={setSearch} />
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
        <>
          <GardenGrid cruxes={cruxList} onDelete={setDeletingId} />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Prev
              </button>
              <span className="text-xs font-mono text-text-muted">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </>
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
