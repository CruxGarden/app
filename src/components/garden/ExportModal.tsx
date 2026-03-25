import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Spinner, Button } from '@/components/ui';
import Modal from '@/components/ui/Modal';
import { exportCrux, exportArtifactsZip } from '@/services/crux-io';
import { getServices } from '@/services';
import type { Crux, Artifact } from '@/api/types';

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

  const subtitle = !loading && artifacts.length > 0
    ? `${crux.title || crux.slug} — ${artifacts.length} file${artifacts.length !== 1 ? 's' : ''}, ${formatBytes(totalSize)}`
    : crux.title || crux.slug;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Export" subtitle={subtitle}>
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner size={18} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Button onClick={handleExportCrux} loading={exporting === 'crux'} disabled={busy} fullWidth>
              Export Crux
            </Button>
            <p className="text-[10px] text-text-muted text-center">
              Full archive — artifacts, collaboration, and snapshot history
            </p>
          </div>

          {artifacts.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Button variant="secondary" onClick={handleExportZip} loading={exporting === 'zip'} disabled={busy} fullWidth>
                Export Artifacts
              </Button>
              <p className="text-[10px] text-text-muted text-center">
                Just the files — ready to unzip and use
              </p>
            </div>
          )}
        </div>
      )}

      {progress && (
        <p className={cn(
          'text-[11px] font-mono text-center truncate mt-3',
          progress === 'Export failed' ? 'text-error' : 'text-text-muted',
        )}>
          {progress}
        </p>
      )}
    </Modal>
  );
}
