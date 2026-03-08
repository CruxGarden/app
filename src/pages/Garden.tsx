import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import JSZip from 'jszip';
import { useAuthStore } from '@/stores/authStore';
import MoodBar from '@/components/layout/MoodBar';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
import { useGarden } from '@/hooks/useGarden';
import { getServices } from '@/services';
import { APP_NAME } from '@/lib/constants';
import { GardenGrid, GardenSearch } from '@/components/garden';
import { ApiKeySetup, IconButton, Spinner, Modal, Button } from '@/components/ui';
import { getApiKey } from '@/ai/keys';
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
  const [showApiKeyBanner, setShowApiKeyBanner] = useState(false);

  useEffect(() => {
    const dismissed = !!localStorage.getItem(DISMISS_KEY);
    if (dismissed) return;
    getApiKey('anthropic').then((key) => {
      if (!key) setShowApiKeyBanner(true);
    });
  }, []);

  const handleDismissBanner = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setShowApiKeyBanner(false);
  };

  // Import state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });

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

        // Detect format version
        const manifestFile = zip.file('manifest.json');
        const manifest = manifestFile ? JSON.parse(await manifestFile.async('text')) : { version: '1.0' };
        const isV2 = manifest.version === '2.0';

        // Read messages
        const messagesFile = zip.file('messages.json');
        const messages = messagesFile ? JSON.parse(await messagesFile.async('text')) : [];

        // Read gates/dimensions based on format version
        let gates: any[] = [];
        if (isV2) {
          const dimFile = zip.file('dimensions.json');
          gates = dimFile ? JSON.parse(await dimFile.async('text')) : [];
        } else {
          const gatesFile = zip.file('gates.json');
          gates = gatesFile ? JSON.parse(await gatesFile.async('text')) : [];
        }

        // Read attachment metadata (v2.0) for ID-keyed artifacts
        let attachmentMeta: any[] = [];
        if (isV2) {
          const attFile = zip.file('attachments.json');
          attachmentMeta = attFile ? JSON.parse(await attFile.async('text')) : [];
        }

        // Count artifact files
        const artifactFiles: { path: string; zipEntry: JSZip.JSZipObject; meta?: any }[] = [];
        if (isV2 && attachmentMeta.length > 0) {
          // v2.0: artifacts keyed by ID, metadata in attachments.json
          for (const att of attachmentMeta) {
            const entry = zip.file(`artifacts/${att.id}/content`);
            if (entry) {
              const filePath = att.meta?.path || att.filename || att.id;
              artifactFiles.push({ path: filePath, zipEntry: entry, meta: att });
            }
          }
        } else {
          // v1.x: artifacts keyed by path
          zip.folder('artifacts')?.forEach((relativePath, entry) => {
            if (!entry.dir) {
              artifactFiles.push({ path: relativePath, zipEntry: entry });
            }
          });
        }

        // Total steps: 1 (create crux) + artifacts + gates + 1 (final update)
        const total = 1 + artifactFiles.length + gates.length + 1;
        let done = 0;
        setImportProgress({ done, total });

        // Create new crux with full metadata restored
        const { crux: cruxService, attachment, dimension: dimService } = getServices();
        const restoredMeta = isV2
          ? { ...(cruxData.meta || {}), messages, gateCount: 0 }
          : { messages, summary: cruxData.summary || null, settings: cruxData.settings || {}, gateCount: 0 };
        const newCrux = await cruxService.create({
          slug,
          title,
          description: cruxData.description || '',
          type: 'workspace',
          meta: restoredMeta,
        });
        done++;
        setImportProgress({ done, total });

        // Upload artifact files
        if (artifactFiles.length > 0) {
          for (let i = 0; i < artifactFiles.length; i++) {
            const { path, zipEntry, meta: attMeta } = artifactFiles[i]!;
            try {
              const blob = await zipEntry.async('blob');
              const filename = path.split('/').pop() || 'file';
              const mime = attMeta?.mimeType || guessMime(filename);
              const fileObj = new File([blob], filename, { type: mime });
              await attachment.upload({
                resourceId: newCrux.id,
                blob: fileObj,
                mimeType: mime,
                meta: attMeta?.meta || { path },
              });
            } catch (err) {
              console.warn(`Failed to import artifact: ${path}`, err);
            }
            done++;
            setImportProgress({ done, total });
          }
        }

        // Restore gates (version history)
        let restoredGateCount = 0;
        if (gates.length > 0) {
          for (let i = 0; i < gates.length; i++) {
            const gate = gates[i];
            const targetData = gate.target || {};
            try {
              const gateSlug = `gate-${i + 1}-${Date.now().toString(36)}`;
              const gateCrux = await cruxService.create({
                slug: gateSlug,
                title: targetData.title || `Gate ${i + 1}`,
                type: 'gate',
                data: targetData.data || '',
                meta: gate.meta || targetData.meta || {},
              });

              await dimService.create({
                sourceId: newCrux.id,
                targetId: gateCrux.id,
                type: 'gate',
                weight: gate.weight ?? i + 1,
                note: gate.note || undefined,
              });
              restoredGateCount++;
            } catch (err) {
              console.warn(`Failed to import gate ${i + 1}`, err);
            }
            done++;
            setImportProgress({ done, total });
          }
        }

        // Final meta update with accurate gateCount
        const finalMeta = isV2
          ? { ...(cruxData.meta || {}), messages, gateCount: restoredGateCount }
          : { ...newCrux.meta, messages, summary: cruxData.summary || null, settings: cruxData.settings || {}, gateCount: restoredGateCount };
        await cruxService.update(newCrux.id, { meta: finalMeta });
        done++;
        setImportProgress({ done, total });

        // Restore workspace layout into localStorage for the new crux
        if (cruxData.layout) {
          const layout = cruxData.layout;
          if (layout.paneOrder && layout.paneVisibility) {
            localStorage.setItem(
              `cruxgarden:layout:${newCrux.id}`,
              JSON.stringify({ paneOrder: layout.paneOrder, paneVisibility: layout.paneVisibility }),
            );
          }
          if (layout.editorTabs) {
            localStorage.setItem(
              `cruxgarden:editor-tabs:${newCrux.id}`,
              JSON.stringify(layout.editorTabs),
            );
          }
          if (layout.folderState) {
            localStorage.setItem(
              `cruxgarden:folder-state:${newCrux.id}`,
              JSON.stringify(layout.folderState),
            );
          }
        }

        // Restore theme preferences
        if (cruxData.theme) {
          if (cruxData.theme.mode) {
            localStorage.setItem('cruxgarden:theme', cruxData.theme.mode);
          }
          if (cruxData.theme.tint) {
            localStorage.setItem('cruxgarden:tint', cruxData.theme.tint);
          }
        }

        refresh();
        navigate(`/c/${newCrux.id}`);
      } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to import .crux file. Make sure it is a valid export.');
      } finally {
        setImporting(false);
        setImportProgress({ done: 0, total: 0 });
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
              <div className="w-12 h-12 rounded-[var(--radius)] overflow-hidden flex items-center justify-center shrink-0 bg-accent-muted ring-1 ring-text-muted/20">
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
    </div>
  );
}
