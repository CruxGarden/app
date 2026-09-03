import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artifact } from '@/api/types';
import { getServices } from '@/services';
import { isTextMime } from '@/lib/mime';

// Re-exported for existing importers; the implementation lives in lib/mime.
export { isImageMime } from '@/lib/mime';

interface UseFileContentResult {
  content: string | null;
  blobUrl: string | null;
  /** True only for the FIRST load — refetches never blank the editor. */
  loading: boolean;
  /**
   * Increments each time content arrives from the store for a reason other
   * than this editor's own save (first load, external edit, restore). Consumers
   * apply it to a live editor instead of remounting one.
   */
  contentVersion: number;
  setContent: (value: string) => void;
  refetch: () => void;
  /**
   * Call immediately BEFORE persisting this editor's own content. The store
   * update that follows changes the artifact's fingerprint, and without this
   * the hook would treat our own save as an external change: refetch, bump
   * contentVersion, and (as the Editor's key) remount Monaco — the "editor
   * flickers and resets my text on save" bug. Cancel with the returned
   * function if the save fails or produced no change.
   */
  expectOwnSave: () => () => void;
}

export function useFileContent(_cruxId: string, artifact: Artifact): UseFileContentResult {
  const [content, setContent] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchKey, setFetchKey] = useState(0);
  const [contentVersion, setContentVersion] = useState(0);
  const ownSaveRef = useRef(false);
  const loadedRef = useRef(false);

  const mime = artifact.mimeType || 'text/plain';
  const filename = (artifact.meta?.path as string) || artifact.filename || '';

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  const expectOwnSave = useCallback(() => {
    ownSaveRef.current = true;
    return () => {
      ownSaveRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Our own save just landed in the store: the content is already what the
    // editor shows. Consume the flag and leave the editor alone.
    if (ownSaveRef.current) {
      ownSaveRef.current = false;
      return;
    }

    let cancelled = false;
    if (!loadedRef.current) setLoading(true);

    const { artifact: artifactService } = getServices();
    artifactService
      .downloadBlob(artifact.id)
      .then((blob) => {
        if (cancelled) return;
        if (isTextMime(mime, filename)) {
          blob.text().then((text) => {
            if (cancelled) return;
            setContent(text);
            setContentVersion((v) => v + 1);
            loadedRef.current = true;
            setLoading(false);
          });
        } else {
          setBlobUrl(URL.createObjectURL(blob));
          setContentVersion((v) => v + 1);
          loadedRef.current = true;
          setLoading(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load file:', artifact.id, err);
        setContent('// Error loading file');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Content identity is the fingerprint, not the row timestamp: metadata
    // edits (rename, move) must not re-download the file.
  }, [artifact.id, artifact.fingerprint, mime, filename, fetchKey]);

  // Clean up blob URLs
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  return { content, blobUrl, loading, contentVersion, setContent, refetch, expectOwnSave };
}
