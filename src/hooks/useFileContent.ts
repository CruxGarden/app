import { useCallback, useEffect, useState } from 'react';
import type { Artifact } from '@/api/types';
import { getServices } from '@/services';

const IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-icon',
]);

const TEXT_PREFIXES = [
  'text/',
  'application/json',
  'application/javascript',
  'application/typescript',
  'application/xml',
  'image/svg+xml',
];

const TEXT_EXTENSIONS = new Set([
  'md', 'mdx', 'txt', 'csv', 'log',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'json', 'jsonc', 'json5',
  'html', 'htm', 'xml', 'svg', 'css', 'scss', 'less',
  'py', 'rb', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
  'sh', 'bash', 'zsh', 'fish',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'sql', 'graphql', 'gql',
  'vue', 'svelte', 'astro',
  'makefile', 'dockerfile',
]);

function isTextMime(mime: string, filename?: string): boolean {
  if (TEXT_PREFIXES.some((t) => mime.startsWith(t))) return true;
  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (TEXT_EXTENSIONS.has(ext)) return true;
    // Files without extensions named like common dotfiles
    const base = filename.split('/').pop()?.toLowerCase() || '';
    if (TEXT_EXTENSIONS.has(base)) return true;
  }
  return false;
}

export function isImageMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime) || mime === 'image/svg+xml';
}

interface UseFileContentResult {
  content: string | null;
  blobUrl: string | null;
  loading: boolean;
  /** Increments each time content is loaded from the server (use as Editor key) */
  contentVersion: number;
  setContent: (value: string) => void;
  refetch: () => void;
}

export function useFileContent(_cruxId: string, artifact: Artifact): UseFileContentResult {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);
  const [contentVersion, setContentVersion] = useState(0);

  const mime = artifact.mimeType || 'text/plain';
  const filename = (artifact.meta?.path as string) || artifact.filename || '';

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { artifact: artifactService } = getServices();
    artifactService
      .downloadBlob(artifact.id)
      .then((blob) => {
        if (cancelled) return;
        if (isTextMime(mime, filename)) {
          blob.text().then((text) => {
            if (!cancelled) {
              setContent(text);
              setContentVersion((v) => v + 1);
              setLoading(false);
            }
          });
        } else {
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setContentVersion((v) => v + 1);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load file:', artifact.id, err);
          setContent('// Error loading file');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artifact.id, artifact.updated, mime, filename, fetchKey]);

  // Clean up blob URLs
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return { content, blobUrl, loading, contentVersion, setContent, refetch };
}
