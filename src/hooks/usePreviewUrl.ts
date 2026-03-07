import { useEffect, useRef, useState, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { cruxes } from '@/api';
import { normalizePath } from '@/lib/rewriteUrls';
import {
  cachePreviewFiles,
  updatePreviewFile,
  clearPreviewCache,
  getPreviewUrl,
  waitForServiceWorker,
  injectPreviewScripts,
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
  const cruxKind = useCruxStore((s) => s.crux?.kind);

  // Determine if this crux is a webapp (explicit kind or auto-detect from index.html)
  const isWebApp = useMemo(() => {
    if (cruxKind === 'webapp') return true;
    if (cruxKind) return false; // explicit non-webapp kind
    // Auto-detect: has an index.html
    return artifacts.some((a) => {
      const p = normalizePath(a.meta?.path || a.filename || '');
      return p === 'index.html';
    });
  }, [cruxKind, artifacts]);

  const [url, setUrl] = useState<string | null>(null);
  const [swReady, setSwReady] = useState(false);
  const [artifactsCached, setArtifactsCached] = useState(false);
  const versionRef = useRef(0);
  const artifactBlobsRef = useRef<PreviewFile[]>([]);
  const needsFullRecacheRef = useRef(true);

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
      needsFullRecacheRef.current = true;
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
      needsFullRecacheRef.current = true;
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
    const injectedHtml = injectPreviewScripts(html, cruxId, isWebApp);
    const htmlFile: PreviewFile = {
      path: norm,
      blob: new Blob([injectedHtml], { type: 'text/html' }),
      mimeType: 'text/html',
    };

    (async () => {
      if (needsFullRecacheRef.current) {
        // Full re-cache: first render or supporting files changed (e.g. AI updated CSS/JS)
        await cachePreviewFiles(cruxId, [htmlFile, ...artifactBlobsRef.current]);
        needsFullRecacheRef.current = false;
      } else {
        // Only HTML changed (e.g. user typing in editor): update just that entry
        await updatePreviewFile(cruxId, htmlFile);
      }
      if (cancelled) return;

      versionRef.current += 1;
      setUrl(getPreviewUrl(cruxId, filePath, versionRef.current));
    })();

    return () => {
      cancelled = true;
    };
  }, [html, cruxId, filePath, enabled, swReady, artifactsCached, isWebApp]);

  // Cleanup cache on unmount or cruxId change
  useEffect(() => {
    return () => {
      clearPreviewCache(cruxId).catch(() => {});
    };
  }, [cruxId]);

  return enabled ? url : null;
}
