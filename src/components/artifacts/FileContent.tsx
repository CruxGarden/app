import { useEffect, useState } from 'react';
import type { Attachment } from '@/api/types';
import { cruxes } from '@/api';

interface FileContentProps {
  artifact: Attachment;
  cruxId: string;
}

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
]);

const TEXT_TYPES = new Set([
  'text/',
  'application/json',
  'application/javascript',
  'image/svg+xml',
]);

function isTextMime(mime: string): boolean {
  return [...TEXT_TYPES].some((t) => mime.startsWith(t));
}

function isImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime) || mime === 'image/svg+xml';
}

export default function FileContent({ artifact, cruxId }: FileContentProps) {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const path = artifact.meta?.path || artifact.filename || artifact.id;
  const ext = path.split('.').pop() || '';
  const mime = artifact.mimeType || 'text/plain';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    cruxes
      .downloadAttachment(cruxId, artifact.id)
      .then((blob) => {
        if (cancelled) return;

        if (isTextMime(mime)) {
          blob.text().then((text) => {
            if (!cancelled) {
              setContent(text);
              setBlobUrl(null);
              setLoading(false);
            }
          });
        } else {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setContent(null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent('// Error loading file');
          setBlobUrl(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [artifact.id, cruxId, mime]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-text-muted animate-pulse">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-mono text-text-muted truncate">
          {path}
        </span>
        <span className="text-[10px] font-mono text-text-muted uppercase">
          {ext}
        </span>
      </div>

      {/* Text content */}
      {content !== null && (
        <pre className="flex-1 overflow-auto p-3 text-xs font-mono text-text leading-relaxed">
          {content}
        </pre>
      )}

      {/* Image preview */}
      {blobUrl && isImageMime(mime) && (
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[rgba(0,0,0,0.2)]">
          <img
            src={blobUrl}
            alt={path}
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      )}

      {/* Other binary — download prompt */}
      {blobUrl && !isImageMime(mime) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="text-text-muted text-sm">
            Binary file ({mime}, {formatSize(artifact.size)})
          </div>
          <a
            href={blobUrl}
            download={path.split('/').pop() || 'file'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent text-bg hover:brightness-110 transition-all"
          >
            <DownloadIcon />
            Download
          </a>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
