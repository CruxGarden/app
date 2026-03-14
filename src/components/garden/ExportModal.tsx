import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { exportCrux, exportArtifactsZip } from '@/services/crux-io';
import { getServices } from '@/services';
import type { Crux, Artifact } from '@/api/types';

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  crux: Crux;
}

export default function ExportModal({ open, onClose, crux }: ExportModalProps) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'crux' | 'zip' | null>(null);
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setProgress('');
    getServices()
      .artifact.findByResource('crux', crux.id)
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
      .finally(() => setLoading(false));
  }, [open, crux.id]);

  const handleExportCrux = useCallback(async () => {
    setExporting('crux');
    setProgress('Fetching data...');
    try {
      const result = await exportCrux({
        cruxId: crux.id,
        messages: (crux.meta?.messages as unknown[]) || [],
        summary: crux.meta?.summary || null,
        onProgress: setProgress,
      });
      triggerDownload(result.blob, result.filename);
      setProgress(result.failed.length > 0
        ? `Done — ${result.failed.length} file${result.failed.length > 1 ? 's' : ''} failed`
        : '');
    } catch {
      setProgress('Export failed');
    } finally {
      setExporting(null);
    }
  }, [crux]);

  const handleExportZip = useCallback(async () => {
    if (artifacts.length === 0) return;
    setExporting('zip');
    setProgress('Packing artifacts...');
    try {
      const result = await exportArtifactsZip({
        cruxSlug: crux.slug,
        artifacts,
        onProgress: setProgress,
      });
      triggerDownload(result.blob, result.filename);
      setProgress(result.failed.length > 0
        ? `Done — ${result.failed.length} file${result.failed.length > 1 ? 's' : ''} failed`
        : '');
    } catch {
      setProgress('Export failed');
    } finally {
      setExporting(null);
    }
  }, [crux.slug, artifacts]);

  const totalSize = artifacts.reduce((sum, a) => sum + (Number(a.size) || 0), 0);
  const busy = exporting !== null;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-display font-medium text-text">Export</h2>
            <p className="text-xs text-text-muted mt-1">
              {crux.title || crux.slug}
              {!loading && artifacts.length > 0 && (
                <span className="ml-1">
                  — {artifacts.length} file{artifacts.length !== 1 ? 's' : ''}, {formatBytes(totalSize)}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className={cn(
              'text-text-muted hover:text-text transition-colors p-1 cursor-pointer',
              busy && 'opacity-30 cursor-not-allowed',
            )}
          >
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Spinner size={18} />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <button
                onClick={handleExportCrux}
                disabled={busy}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                  'text-sm font-medium font-body transition-all',
                  busy
                    ? 'bg-accent-muted text-accent border border-accent/20 cursor-wait'
                    : 'bg-accent-muted text-accent border border-accent/20 hover:border-accent cursor-pointer',
                )}
              >
                {exporting === 'crux' ? <Spinner size={14} /> : null}
                Export Crux
              </button>
              <p className="text-[10px] text-text-muted text-center">
                Full archive — artifacts, conversation, and version history
              </p>
            </div>

            {artifacts.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handleExportZip}
                  disabled={busy}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                    'text-sm font-medium font-body transition-all',
                    busy
                      ? 'bg-surface text-text-muted border border-border cursor-wait'
                      : 'bg-surface text-text-muted border border-border hover:border-text-muted hover:text-text cursor-pointer',
                  )}
                >
                  {exporting === 'zip' ? <Spinner size={14} /> : null}
                  Export Artifacts
                </button>
                <p className="text-[10px] text-text-muted text-center">
                  Just the files — ready to unzip and use
                </p>
              </div>
            )}
          </div>
        )}

        {progress && (
          <p className={cn(
            'text-[11px] font-mono text-center truncate',
            progress === 'Export failed' ? 'text-error' : 'text-text-muted',
          )}>
            {progress}
          </p>
        )}

      </div>
    </Modal>
  );
}
