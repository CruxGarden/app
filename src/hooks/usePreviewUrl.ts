import { useEffect, useRef, useState, useMemo } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices } from '@/services';
import { normalizePath } from '@/lib/rewriteUrls';
import { Capability, can } from '@/lib/platform';
import { folderForCrux } from '@/services/project-folder';
import {
  cachePreviewFiles,
  updatePreviewFile,
  clearPreviewCache,
  getPreviewUrl,
  waitForServiceWorker,
  injectPreviewScripts,
  type PreviewFile,
} from '@/lib/previewCache';

interface PreviewBridge {
  start(folder: string): Promise<string>;
  stop(folder: string): Promise<void>;
}

function previewBridge(): PreviewBridge | null {
  if (!can(Capability.PreviewServer)) return null;
  return (window as unknown as { electronAPI: { preview: PreviewBridge } }).electronAPI.preview;
}

/**
 * Desktop preview (ADR 0003): a local static server serves the Project Folder
 * verbatim — no caching layer, no injection. The disk is already current
 * (editor auto-saves + write-through + external edits), so this hook only
 * manages the server lifecycle and bumps a version to reload the iframe.
 */
function useDesktopPreviewUrl(
  html: string | null,
  cruxId: string,
  filePath: string,
  enabled: boolean,
): string | null {
  const artifacts = useCruxStore((s) => s.artifacts);
  const [base, setBase] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const versionRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const artifactKey = useMemo(
    () => artifacts.map((a) => `${a.id}:${a.fingerprint || a.updated}`).join(','),
    [artifacts],
  );

  // Server lifecycle — one server per open crux, stopped when leaving it
  useEffect(() => {
    if (!enabled) return;
    const bridge = previewBridge();
    if (!bridge) return;

    let cancelled = false;
    let startedFolder: string | null = null;

    (async () => {
      const folder = await folderForCrux(cruxId);
      if (!folder || cancelled) return;
      try {
        const serverUrl = await bridge.start(folder);
        startedFolder = folder;
        if (!cancelled) setBase(serverUrl);
      } catch (err) {
        console.error('[preview] failed to start server:', err);
      }
    })();

    return () => {
      cancelled = true;
      setBase(null);
      if (startedFolder) bridge.stop(startedFolder).catch(() => {});
    };
  }, [cruxId, enabled]);

  // Reload the iframe when content changes (editor writes land on disk via
  // write-through; external edits announce via ingestion → artifacts refresh)
  useEffect(() => {
    if (!enabled || !base || !html) {
      if (!enabled || !html) setUrl(null);
      return;
    }
    versionRef.current += 1;
    const next = `${base}/${normalizePath(filePath)}?v=${versionRef.current}`;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setUrl(next), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [html, base, filePath, enabled, artifactKey]);

  return enabled ? url : null;
}

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
  // Desktop: local static server over the Project Folder (ADR 0003).
  // Both hooks run unconditionally (rules of hooks); exactly one is enabled.
  const desktop = can(Capability.PreviewServer);
  const desktopUrl = useDesktopPreviewUrl(html, cruxId, filePath, enabled && desktop);
  const webEnabled = enabled && !desktop;

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
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const artifactBlobsRef = useRef<PreviewFile[]>([]);
  const needsFullRecacheRef = useRef(true);

  // Wait for the service worker to be ready (once; web only)
  useEffect(() => {
    if (desktop) return;
    let cancelled = false;
    waitForServiceWorker().then((ready) => {
      if (!cancelled) setSwReady(ready);
    });
    return () => {
      cancelled = true;
    };
  }, [desktop]);

  // Stable fingerprint of the artifact list — only re-download when files actually change
  const artifactKey = useMemo(
    () => artifacts.map((a) => `${a.id}:${a.fingerprint || a.updated}`).join(','),
    [artifacts],
  );

  // Effect 1: Download all non-HTML artifacts when the artifact list changes
  useEffect(() => {
    if (!webEnabled || !swReady) return;

    const norm = normalizePath(filePath);
    const others = artifacts.filter((a) => {
      const aPath = normalizePath(a.meta?.path || a.filename || a.id);
      // Skip the current HTML file and metadata files not needed for preview
      return aPath !== norm && aPath !== 'preview.jpg';
    });

    if (others.length === 0) {
      artifactBlobsRef.current = [];
      needsFullRecacheRef.current = true;
      setArtifactsCached(true);
      return;
    }

    let cancelled = false;
    setArtifactsCached(false);

    const { artifact } = getServices();
    Promise.allSettled(
      others.map(async (a) => {
        const blob = await artifact.downloadBlob(a.id);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cruxId, filePath, webEnabled, artifactKey, swReady]);

  // Effect 2: Cache everything (initial) or just update HTML (subsequent changes)
  useEffect(() => {
    if (!webEnabled || !html || !swReady || !artifactsCached) {
      if (!webEnabled || !html) setUrl(null);
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
      const wasFullRecache = needsFullRecacheRef.current;
      if (wasFullRecache) {
        // Full re-cache: first render or supporting files changed (e.g. AI updated CSS/JS)
        await cachePreviewFiles(cruxId, [htmlFile, ...artifactBlobsRef.current]);
        needsFullRecacheRef.current = false;
      } else {
        // Only HTML changed (e.g. user typing in editor): update just that entry
        await updatePreviewFile(cruxId, htmlFile);
      }
      if (cancelled) return;

      versionRef.current += 1;
      const newUrl = getPreviewUrl(cruxId, filePath, versionRef.current);

      // Debounce all URL updates to prevent flash during rapid changes.
      // Full recache (AI wrote a file) gets a short delay; HTML-only edits get longer.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!cancelled) setUrl(newUrl);
      }, wasFullRecache ? 100 : 300);
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [html, cruxId, filePath, webEnabled, swReady, artifactsCached, isWebApp]);

  // Cleanup cache on unmount or cruxId change (web only)
  useEffect(() => {
    if (desktop) return;
    return () => {
      clearPreviewCache(cruxId).catch(() => {});
    };
  }, [cruxId, desktop]);

  if (desktop) return desktopUrl;
  return webEnabled ? url : null;
}
