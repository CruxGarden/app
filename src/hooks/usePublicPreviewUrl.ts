import { useEffect, useRef, useState } from 'react';
import { publicApi } from '@/api';
import type { Attachment } from '@/api/types';
import {
  cachePreviewFiles,
  clearPreviewCache,
  getPreviewUrl,
  waitForServiceWorker,
  type PreviewFile,
} from '@/lib/previewCache';

/**
 * Downloads all public attachments, caches them via the preview service worker,
 * and returns an iframe-ready URL for the published display mode.
 *
 * Downloads once per crux — does not re-download unless username/slug changes.
 *
 * @param attachments — all attachments for the crux
 * @param entryId     — attachment ID of the entry page (e.g. index.html)
 * @param username    — author username (for public API)
 * @param slug        — crux slug (for public API)
 */
export function usePublicPreviewUrl(
  attachments: Attachment[],
  entryId: string,
  username: string,
  slug: string,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const [swReady, setSwReady] = useState(false);
  const versionRef = useRef(0);
  const cachedKeyRef = useRef<string | null>(null);

  // Use a stable cache key from username+slug
  const cacheKey = `pub-${username}-${slug}`;

  // Wait for the service worker to be ready (once)
  useEffect(() => {
    let cancelled = false;
    waitForServiceWorker().then((ready) => {
      if (!cancelled) setSwReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Download all attachments and cache (once per crux)
  useEffect(() => {
    if (!swReady || attachments.length === 0) return;

    // Skip if already cached for this crux
    if (cachedKeyRef.current === cacheKey) return;

    let cancelled = false;

    (async () => {
      const results = await Promise.allSettled(
        attachments.map(async (a) => {
          const blob = await publicApi.downloadAttachment(username, slug, a.id);
          const path = a.meta?.path || a.filename || a.id;
          return { path, blob, mimeType: a.mimeType } as PreviewFile;
        }),
      );

      if (cancelled) return;

      const files: PreviewFile[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') files.push(r.value);
      }

      if (files.length === 0) return;

      await cachePreviewFiles(cacheKey, files);
      if (cancelled) return;

      cachedKeyRef.current = cacheKey;

      // Find the entry file's path
      const entry = attachments.find((a) => a.id === entryId);
      const entryPath = entry?.meta?.path || entry?.filename || 'index.html';

      versionRef.current += 1;
      setUrl(getPreviewUrl(cacheKey, entryPath, versionRef.current));
    })();

    return () => {
      cancelled = true;
    };
  }, [attachments, entryId, username, slug, swReady, cacheKey]);

  // Cleanup cache on unmount
  useEffect(() => {
    return () => {
      clearPreviewCache(cacheKey).catch(() => {});
    };
  }, [cacheKey]);

  return url;
}
