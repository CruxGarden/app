import { useState, useRef, useCallback } from 'react';
import { ensureLocalAuthor } from '@/services';
import { exportGarden, importGarden, wipeGarden } from '@/services/garden-io';
import { useAuthStore } from '@/stores/authStore';
import { Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

const WIPE_CONFIRMATION = 'delete me';

export default function DataSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

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

    // Offer to export current garden before overwriting
    const choice = confirm(
      'Importing a garden will replace ALL existing data.\n\nWould you like to export your current garden first as a backup?',
    );
    if (choice) {
      try {
        const backup = await exportGarden({ onProgress: setStatus });
        const url = URL.createObjectURL(backup.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = backup.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Backup export failed:', err);
        const proceed = confirm('Backup export failed. Continue with import anyway?');
        if (!proceed) { e.target.value = ''; return; }
      }
    }

    // Final confirmation
    if (!confirm('This will replace your entire garden. Continue?')) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    setError('');
    try {
      await importGarden({ data: file, onProgress: setStatus });

      // Re-ensure local author exists after import
      const author = await ensureLocalAuthor();
      useAuthStore.setState({ author });

      setStatus('Import complete — reload recommended');
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
      setStatus('Garden wiped — reloading...');
      setTimeout(() => window.location.reload(), 800);
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
      <h2 className="font-display text-sm font-medium text-accent mb-4">Data</h2>

      <p className="text-xs text-text-muted mb-4">
        Export or import your entire garden — all cruxes, files, conversations, and settings.
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={handleExport}
          disabled={busy}
          className={cn(
            'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
            'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {exporting ? <><Spinner size={12} /> Exporting...</> : 'Export garden'}
        </button>
        <button
          onClick={() => importRef.current?.click()}
          disabled={busy}
          className={cn(
            'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
            'bg-surface border border-border text-text hover:bg-accent-muted transition-colors cursor-pointer',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {importing ? <><Spinner size={12} /> Importing...</> : 'Import garden'}
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".garden"
          className="hidden"
          onChange={handleImport}
        />
      </div>

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
        <button
          onClick={handleWipe}
          disabled={busy || wipeConfirm !== WIPE_CONFIRMATION}
          className={cn(
            'px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)]',
            'bg-error/10 border border-error text-error hover:bg-error/20 transition-colors cursor-pointer',
            'disabled:opacity-30 disabled:cursor-not-allowed',
          )}
        >
          {wiping ? <><Spinner size={12} /> Wiping...</> : 'Wipe garden'}
        </button>
      </div>

      {status && <p className="text-xs font-mono text-text-muted mt-2">{status}</p>}
      {error && <p className="text-xs font-mono text-error mt-2">{error}</p>}
    </Panel>
  );
}
