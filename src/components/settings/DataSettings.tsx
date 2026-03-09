import { useState, useRef, useCallback } from 'react';
import { ensureLocalAuthor } from '@/services';
import { exportGarden, importGarden } from '@/services/garden-io';
import { useAuthStore } from '@/stores/authStore';
import { Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

export default function DataSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
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

  const busy = exporting || importing;

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

      {status && <p className="text-xs font-mono text-text-muted mt-2">{status}</p>}
      {error && <p className="text-xs font-mono text-error mt-2">{error}</p>}
    </Panel>
  );
}
