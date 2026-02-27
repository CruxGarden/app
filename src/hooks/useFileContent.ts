import { useEffect, useState } from 'react';
import type { Attachment } from '@/api/types';
import { cruxes } from '@/api';

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
]);

const TEXT_PREFIXES = ['text/', 'application/json', 'application/javascript', 'image/svg+xml'];

function isTextMime(mime: string): boolean {
  return TEXT_PREFIXES.some((t) => mime.startsWith(t));
}

export function isImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime) || mime === 'image/svg+xml';
}

interface UseFileContentResult {
  content: string | null;
  blobUrl: string | null;
  loading: boolean;
  setContent: (value: string) => void;
}

export function useFileContent(cruxId: string, artifact: Attachment): UseFileContentResult {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const mime = artifact.mimeType || 'text/plain';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setContent(null);
    setBlobUrl(null);

    cruxes
      .downloadAttachment(cruxId, artifact.id)
      .then((blob) => {
        if (cancelled) return;
        if (isTextMime(mime)) {
          blob.text().then((text) => {
            if (!cancelled) {
              setContent(text);
              setLoading(false);
            }
          });
        } else {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setContent('// Error loading file');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifact.id, cruxId, mime]);

  // Clean up blob URLs
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return { content, blobUrl, loading, setContent };
}
