import { useEffect, useRef, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { cruxes } from '@/api';
import { normalizePath } from '@/lib/rewriteUrls';
import {
  cachePreviewFiles,
  updatePreviewFile,
  clearPreviewCache,
  getPreviewUrl,
  waitForServiceWorker,
  type PreviewFile,
} from '@/lib/previewCache';

/**
 * Downloads all workspace artifacts, caches them via the preview service worker,
 * and returns an iframe-ready URL like `/__preview/{cruxId}/index.html?v=1`.
 *
 * Artifacts are only downloaded when the artifact list changes. The current
 * HTML file is updated in-place on every content change (no re-download).
 *
 * @param html      — raw HTML content (may include unsaved edits from editor)
 * @param cruxId    — current crux ID
 * @param filePath  — path of the HTML file in the virtual FS (e.g. 'pages/index.html')
 * @param enabled   — only activate when in HTML preview mode
 */
export function usePreviewUrl(
  html: string | null,
  cruxId: string,
  filePath: string,
  enabled: boolean,
): string | null {
  const artifacts = useCruxStore((s) => s.artifacts);
  const [url, setUrl] = useState<string | null>(null);
  const [swReady, setSwReady] = useState(false);
  const [artifactsCached, setArtifactsCached] = useState(false);
  const versionRef = useRef(0);
  const artifactBlobsRef = useRef<PreviewFile[]>([]);

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

  // Effect 1: Download all non-HTML artifacts when the artifact list changes
  useEffect(() => {
    if (!enabled || !swReady) return;

    const norm = normalizePath(filePath);
    const others = artifacts.filter((a) => {
      const aPath = normalizePath(a.meta?.path || a.filename || a.id);
      return aPath !== norm;
    });

    if (others.length === 0) {
      artifactBlobsRef.current = [];
      setArtifactsCached(true);
      return;
    }

    let cancelled = false;
    setArtifactsCached(false);

    Promise.allSettled(
      others.map(async (a) => {
        const blob = await cruxes.downloadAttachment(cruxId, a.id);
        const path = a.meta?.path || a.filename || a.id;
        return { path, blob, mimeType: a.mimeType } as PreviewFile;
      }),
    ).then((results) => {
      if (cancelled) return;
      const files: PreviewFile[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') files.push(r.value);
      }
      artifactBlobsRef.current = files;
      setArtifactsCached(true);
    });

    return () => {
      cancelled = true;
    };
  }, [cruxId, filePath, enabled, artifacts, swReady]);

  // Effect 2: Cache everything (initial) or just update HTML (subsequent changes)
  useEffect(() => {
    if (!enabled || !html || !swReady || !artifactsCached) {
      if (!enabled || !html) setUrl(null);
      return;
    }

    let cancelled = false;
    const norm = normalizePath(filePath);
    const htmlFile: PreviewFile = {
      path: norm,
      blob: new Blob([html], { type: 'text/html' }),
      mimeType: 'text/html',
    };

    (async () => {
      if (versionRef.current === 0) {
        // First render: cache all files together
        await cachePreviewFiles(cruxId, [htmlFile, ...artifactBlobsRef.current]);
      } else {
        // Subsequent: just update the HTML entry
        await updatePreviewFile(cruxId, htmlFile);
      }
      if (cancelled) return;

      versionRef.current += 1;
      setUrl(getPreviewUrl(cruxId, filePath, versionRef.current));
    })();

    return () => {
      cancelled = true;
    };
  }, [html, cruxId, filePath, enabled, swReady, artifactsCached]);

  // Cleanup cache on unmount or cruxId change
  useEffect(() => {
    return () => {
      clearPreviewCache(cruxId).catch(() => {});
    };
  }, [cruxId]);

  return enabled ? url : null;
}
