import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { exportGarden, confirmAndImportGarden, wipeGarden } from '@/services/garden-io';
import { Panel, Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { Capability, can } from '@/lib/platform';
import { getGardenRoot, chooseGardenRoot, shortenHomePath } from '@/services/desktop';

const WIPE_CONFIRMATION = 'delete me';

export default function DataSettings() {
  const [collapsed, setCollapsed] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);
  const desktop = can(Capability.ProjectFolder);
  const [gardenRoot, setGardenRoot] = useState<string | null>(null);

  useEffect(() => {
    if (desktop) getGardenRoot().then(setGardenRoot);
  }, [desktop]);

  const handleChooseGardenRoot = useCallback(async () => {
    const chosen = await chooseGardenRoot();
    if (chosen) setGardenRoot(chosen);
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError('');
    try {
      const result = await exportGarden({ onProgress: setStatus });

      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus('Export complete');
    } catch (err) {
      console.error('Garden export failed:', err);
      setError('Export failed');
      setStatus('');
    } finally {
      setExporting(false);
    }
  }, []);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setError('');
    try {
      const imported = await confirmAndImportGarden({
        data: file,
        onProgress: setStatus,
        onPostImport: async () => { await useAppStore.getState().ensureAuthor(); },
      });

      if (!imported) {
        setStatus('');
      }
    } catch (err) {
      console.error('Garden import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed — the file may be corrupted');
      setStatus('');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }, []);

  const handleWipe = useCallback(async () => {
    setWiping(true);
    setError('');
    try {
      await wipeGarden(setStatus);
      setWipeConfirm('');
      setStatus('Garden wiped — redirecting...');
      setTimeout(() => { window.location.href = '/'; }, 600);
    } catch (err) {
      console.error('Garden wipe failed:', err);
      setError('Wipe failed');
      setStatus('');
    } finally {
      setWiping(false);
    }
  }, []);

  const busy = exporting || importing || wiping;

  return (
    <Panel padding="md">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-2 w-full cursor-pointer group"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'text-text-muted transition-transform duration-150',
            collapsed ? '-rotate-90' : 'rotate-0',
          )}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <h2 className="font-display text-sm font-medium text-accent">Garden</h2>
      </button>

      {!collapsed && (
        <div className="mt-5">
          <p className="text-xs text-text-muted mb-4">
            Export or import your entire garden — all cruxes, files, conversations, and settings.
          </p>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExport} disabled={busy} loading={exporting}>
              {exporting ? 'Exporting...' : 'Export garden'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => importRef.current?.click()} disabled={busy} loading={importing}>
              {importing ? 'Importing...' : 'Import garden'}
            </Button>
            <input
              ref={importRef}
              type="file"
              accept=".garden"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          {desktop && (
            <>
              <hr className="border-border my-6" />
              <h3 className="font-display text-sm font-medium text-text mb-2">Garden location</h3>
              <p className="text-xs text-text-muted mb-3">
                New cruxes create their project folders here. Existing folders stay where they
                are and keep working.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 text-xs font-mono rounded-[var(--radius-sm)] bg-surface-solid border border-border text-text truncate">
                  {gardenRoot ? shortenHomePath(gardenRoot) : 'Loading…'}
                </code>
                <Button variant="secondary" size="sm" onClick={handleChooseGardenRoot} disabled={busy}>
                  Choose…
                </Button>
              </div>
            </>
          )}

          <hr className="border-border my-6" />

          <h3 className="font-display text-sm font-medium text-error mb-2">Danger zone</h3>
          <p className="text-xs text-text-muted mb-3">
            Permanently delete all cruxes, files, conversations, and settings.
            Type <span className="font-mono text-text">"{WIPE_CONFIRMATION}"</span> to confirm.
          </p>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder={WIPE_CONFIRMATION}
              disabled={busy}
              className={cn(
                'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)] w-32',
                'bg-surface border border-border text-text placeholder:text-text-muted',
                'focus:outline-none focus:border-error',
                'disabled:opacity-50',
              )}
            />
            <Button variant="danger" size="sm" onClick={handleWipe} disabled={busy || wipeConfirm !== WIPE_CONFIRMATION} loading={wiping}>
              Wipe garden
            </Button>
          </div>

          {status && <p className="text-xs font-mono text-text-muted mt-2">{status}</p>}
          {error && <p className="text-xs font-mono text-error mt-2">{error}</p>}
        </div>
      )}
    </Panel>
  );
}
