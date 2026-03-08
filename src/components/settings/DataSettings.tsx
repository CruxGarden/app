import { useState, useRef, useCallback } from 'react';
import { getSqliteClient } from '@/services/sqlite/client';
import { ensureLocalAuthor } from '@/services';
import { useAuthStore } from '@/stores/authStore';
import { Panel, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function DataSettings() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setError('');
    setStatus('Exporting...');
    try {
      const data = await getSqliteClient().export();
      const blob = new Blob([data], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      a.download = `crux-garden-${ts}.garden`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus(`Exported ${formatBytes(data.byteLength)}`);
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
    setStatus('Importing...');
    try {
      const data = await file.arrayBuffer();
      await getSqliteClient().import(data);

      // Re-ensure local author exists after import
      const author = await ensureLocalAuthor();
      useAuthStore.setState({ author });

      setStatus('Import complete — reload recommended');
    } catch (err) {
      console.error('Garden import failed:', err);
      setError('Import failed — the file may be corrupted');
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
