/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useFileContent } from '@/hooks/useFileContent';
import { getMonacoLanguage, getExtension } from '@/lib/monacoLanguages';
import { pathOf, basename } from '@/lib/artifact-path';
import { isImageMime, isVideoMime } from '@/lib/mime';
import { Capability, can } from '@/lib/platform';
import {
  previewFor,
  mountedIframeSrc,
  isHtmlPath,
  isConfigJsonPath,
  isPreviewJpgPath,
} from '@/lib/preview-decision';
import {
  captureHtml,
  captureImage,
  captureVideo,
  previewOrigin,
  CAPTURE_SIZE,
} from '@/lib/thumbnail-capture';
import { registerCruxGardenThemes } from '@/lib/monacoTheme';
import { captureLocalPreview } from '@/services/preview-capture';
import { getServices } from '@/services';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import TemplateForm from '@/components/workspace/TemplateForm';
import { usePreviewUrl } from '@/hooks/usePreviewUrl';
import { useSitePreview } from '@/hooks/useSitePreview';
import type { Artifact } from '@/api/types';
import type { EditorTab } from '@/stores/uiStore';
import type { FormSchema } from '@/templates';
import { LoadingPanel } from '@/components/ui';

// ── Save handler registry (module-level, accessible from outside) ──
const editorSaveHandlers = new Map<string, () => Promise<void>>();

/** Save all dirty editors. Awaitable — resolves when all saves complete. */
export async function saveAllDirtyEditors(): Promise<void> {
  const promises = Array.from(editorSaveHandlers.values()).map((fn) => fn());
  await Promise.all(promises);
}

interface EditorContentProps {
  tab: EditorTab;
  artifact: Artifact;
  cruxId: string;
  saveRef?: React.MutableRefObject<(() => void) | null>;
  captureRef?: React.MutableRefObject<(() => void) | null>;
}

export default function EditorContent({
  tab,
  artifact,
  cruxId,
  saveRef,
  captureRef,
}: EditorContentProps) {
  const { content, blobUrl, loading, contentVersion, setContent } = useFileContent(
    cruxId,
    artifact,
  );
  const { setTabDirty, setTabScrollTop } = useUIStore();
  const activeMode = useThemeStore((s) => s.activeMode);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveHandlerRef = useRef<() => void>(() => {});
  const scrollRafRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  // Desktop: local-server URL currently shown in the preview iframe (capture target)
  const desktopCaptureUrlRef = useRef<string | null>(null);

  const path = pathOf(artifact) || artifact.id;
  const ext = getExtension(path);
  const mime = artifact.mimeType || 'text/plain';
  const language = getMonacoLanguage(path);
  const themeName = activeMode === 'dark' ? 'crux-garden-dark' : 'crux-garden-light';
  const isHtmlFile = isHtmlPath(path);
  const isConfigJson = isConfigJsonPath(path);

  // Form schema from crux meta (set during template creation)
  const formSchema = useCruxStore((s) => {
    const meta = s.crux?.meta as Record<string, unknown> | undefined;
    return (meta?.formSchema as FormSchema | undefined) ?? null;
  });

  // Form data change handler — updates content as pretty JSON, marks dirty, triggers save
  const handleFormChange = useCallback(
    (newData: Record<string, unknown>) => {
      const json = JSON.stringify(newData, null, 2);
      contentRef.current = json;
      dirtyRef.current = true;
      setContent(json);
      setTabDirty(tab.id, true);
      // Auto-save immediately so preview refreshes
      saveHandlerRef.current();
    },
    [tab.id, setContent, setTabDirty],
  );

  // Auto-switch config.json to form mode on first open when schema exists
  const { setTabViewMode } = useUIStore();
  useEffect(() => {
    if (isConfigJson && formSchema && tab.viewMode === 'source') {
      setTabViewMode(tab.id, 'form');
    }
    // Only run on mount (tab.id is the key prop, so this runs once per tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep ref in sync when content loads
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Sync theme changes — rAF ensures the call lands after any in-progress
  // editor mount completes (setTheme is global and broadcasts to all instances)
  useEffect(() => {
    if (!monacoRef.current) return;
    const id = requestAnimationFrame(() => {
      if (!disposedRef.current && monacoRef.current) {
        monacoRef.current.editor.setTheme(themeName);
      }
    });
    return () => cancelAnimationFrame(id);
  }, [themeName]);

  // Re-register Monaco theme when palette changes (CSS vars → hex)
  useEffect(() => {
    const handler = () => {
      if (!monacoRef.current) return;
      requestAnimationFrame(() => {
        if (!disposedRef.current && monacoRef.current) {
          registerCruxGardenThemes(monacoRef.current);
          monacoRef.current.editor.setTheme(themeName);
        }
      });
    };
    document.addEventListener('palette-change', handler);
    return () => document.removeEventListener('palette-change', handler);
  }, [themeName]);

  // Save handler — calls API directly (no store dependency, survives reset)
  const handleSave = useCallback(async () => {
    const current = contentRef.current;
    if (current === null || !dirtyRef.current) return;
    try {
      const blob = new Blob([current], { type: mime });
      const { artifact: artifactService } = getServices();
      const updated = await artifactService.upload({
        resourceId: cruxId,
        blob,
        mimeType: mime,
        meta: { path: pathOf(artifact) || 'file' },
      });
      dirtyRef.current = false;
      setTabDirty(tab.id, false);
      // Route through the store action — it also recomputes publish state
      useCruxStore.getState().updateArtifact(updated.id, updated);
    } catch (err: unknown) {
      console.error('Save failed:', err);
    }
  }, [artifact, mime, tab.id, cruxId, setTabDirty]);

  // Keep save ref stable for Monaco keybinding (avoids stale closure)
  useEffect(() => {
    saveHandlerRef.current = handleSave;
  }, [handleSave]);

  // Register save handler in module-level map (for saveAllDirtyEditors)
  useEffect(() => {
    editorSaveHandlers.set(tab.id, handleSave);
    return () => {
      editorSaveHandlers.delete(tab.id);
    };
  }, [tab.id, handleSave]);

  // Expose save to parent via ref
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [handleSave, saveRef]);

  // Save a JPEG blob as preview.jpg (create or replace)
  const savePreviewBlob = useCallback(
    (blob: Blob) => {
      const { artifact: artifactService } = getServices();
      const artifacts = useCruxStore.getState().artifacts;
      const existing = artifacts.find((a) => {
        const p = pathOf(a).toLowerCase();
        return p === 'preview.jpg';
      });
      const uploadOpts = {
        resourceId: cruxId,
        blob,
        mimeType: 'image/jpeg',
        meta: { path: 'preview.jpg' },
      };
      artifactService
        .upload(uploadOpts)
        .then((saved) => {
          const store = useCruxStore.getState();
          if (existing) store.updateArtifact(existing.id, saved);
          else store.addArtifact(saved);
        })
        .catch((err) => console.error('Thumbnail save failed:', err));
    },
    [cruxId],
  );

  // HTML capture — postMessage handshake with the preview iframe
  const handleHtmlCapture = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;
    captureHtml(iframe, previewOrigin())
      .then(savePreviewBlob)
      .catch((err) => console.error('Capture failed:', err));
  }, [savePreviewBlob]);

  // Image capture — scale image to canvas, export as JPEG
  const handleImageCapture = useCallback(() => {
    if (!blobUrl) return;
    const img = new Image();
    img.src = blobUrl;
    captureImage(img)
      .then(savePreviewBlob)
      .catch((err) => console.error('Capture failed:', err));
  }, [blobUrl, savePreviewBlob]);

  // Video capture — seek to 1s, grab frame
  const handleVideoCapture = useCallback(() => {
    if (!blobUrl) return;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    const capture = captureVideo(video);
    video.src = blobUrl;
    capture
      .then(savePreviewBlob)
      .catch((err) => console.error('Capture failed:', err))
      .finally(() => URL.revokeObjectURL(video.src));
  }, [blobUrl, savePreviewBlob]);

  // Desktop capture — hidden main-process window screenshots the local
  // preview URL (works for Site Cruxes and static preview alike; the web
  // postMessage path can't reach the un-injected desktop preview, ADR 0003)
  const handleDesktopCapture = useCallback(() => {
    const url = desktopCaptureUrlRef.current;
    if (!url) return;
    captureLocalPreview(url)
      .then(savePreviewBlob)
      .catch((err) => console.error('Capture failed:', err));
  }, [savePreviewBlob]);

  // Unified capture dispatcher — picks strategy based on file type
  const isImage = isImageMime(mime);
  const isVideo = isVideoMime(mime);
  const handleCapture = useCallback(() => {
    if (desktopCaptureUrlRef.current) handleDesktopCapture();
    else if (isHtmlFile) handleHtmlCapture();
    else if (isImage) handleImageCapture();
    else if (isVideo) handleVideoCapture();
  }, [
    isHtmlFile,
    isImage,
    isVideo,
    handleDesktopCapture,
    handleHtmlCapture,
    handleImageCapture,
    handleVideoCapture,
  ]);

  // Expose capture to parent via ref
  useEffect(() => {
    if (captureRef) captureRef.current = handleCapture;
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [handleCapture, captureRef]);

  // Auto-capture: re-shoot the thumbnail when the file CHANGES (saved or
  // AI-written) — never on mere open. `contentVersion` starts at 0 and the
  // initial load bumps it to 1, so the baseline can only be recorded once the
  // first load has landed; anchoring on the pre-load value made every open
  // rewrite preview.jpg (new JPEG bytes → new fingerprint → phantom
  // "unpublished changes").
  const isPreviewFile = isPreviewJpgPath(path);
  const canAutoCapture = isHtmlFile && !isPreviewFile;
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (loading) return;
    if (baselineVersionRef.current === null) {
      baselineVersionRef.current = contentVersion; // first loaded version
      return;
    }
    if (contentVersion <= baselineVersionRef.current) return;
    if (!canAutoCapture) return;

    // Give the iframe time to render the new content before shooting
    if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
    autoCaptureTimerRef.current = setTimeout(() => handleCapture(), 3000);

    return () => {
      if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
    };
  }, [contentVersion, canAutoCapture, handleCapture, loading]);

  // Defer Monaco mount by one frame so any disposed editor's async cleanup
  // (rAF, rIC) completes before the new editor tries to initialise
  const [editorReady, setEditorReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEditorReady(true));
    return () => {
      cancelAnimationFrame(id);
      setEditorReady(false);
    };
  }, []);

  // Cleanup: auto-save dirty content, cancel pending scroll rAF, mark disposed
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      // Auto-save dirty content on unmount (fire-and-forget)
      if (dirtyRef.current) {
        saveHandlerRef.current();
      }
    };
  }, []);

  // Global Cmd+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveHandlerRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Monaco editor mount — stable callback, uses refs to avoid stale closures
  const handleEditorMount = useCallback(
    (editor: Monaco.editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
      if (disposedRef.current) return;

      monacoRef.current = monaco;
      editorRef.current = editor;

      registerCruxGardenThemes(monaco);
      // Defer setTheme by one frame — it broadcasts to all instances and can
      // crash if another editor's view layer isn't fully initialized yet
      requestAnimationFrame(() => {
        if (!disposedRef.current) monaco.editor.setTheme(themeName);
      });

      // Restore scroll position
      if (tab.scrollTop > 0) {
        editor.setScrollTop(tab.scrollTop);
      }

      // Track scroll position (debounced via rAF, guarded against unmount)
      editor.onDidScrollChange(() => {
        if (disposedRef.current) return;
        if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = requestAnimationFrame(() => {
          if (!disposedRef.current) {
            setTabScrollTop(tab.id, editor.getScrollTop());
          }
        });
      });

      // Cmd+S keybinding — uses ref so it always calls the latest save handler
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveHandlerRef.current();
      });
    },
    [themeName, tab.id, tab.scrollTop, setTabScrollTop],
  );

  // Handle content changes — update ref + state (state needed for preview modes)
  // Using defaultValue means React re-renders won't cause Monaco to re-apply content
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        contentRef.current = value;
        dirtyRef.current = true;
        setContent(value);
        setTabDirty(tab.id, true);
      }
    },
    [tab.id, setContent, setTabDirty],
  );

  // Site cruxes (Astro): preview = the project's own dev server with HMR.
  // Plain cruxes: static preview (local server on desktop, SW cache on web).
  const site = useSitePreview(cruxId, path);
  const previewUrl = usePreviewUrl(content, cruxId, path, isHtmlFile && !site.isSite);

  // When preview URL changes, reload the iframe content.
  // For the initial load, src handles it. For subsequent updates,
  // the service worker cache is already updated — just reload in place.
  useEffect(() => {
    if (!previewUrl) return;
    const iframe = previewIframeRef.current;
    if (previewUrlRef.current && iframe?.contentWindow) {
      // Same base path — service worker cache was updated, just reload
      iframe.contentWindow.location.reload();
    }
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);

  // Keep the desktop capture target current: whatever local-server URL the
  // preview iframe is showing (dev server for Site Cruxes, static server for
  // plain cruxes). Null on web — the postMessage capture handles that path.
  const currentIframeSrc = mountedIframeSrc({ path, site, previewUrl });
  useEffect(() => {
    const isLocalServer =
      !!currentIframeSrc && /^http:\/\/(127\.0\.0\.1|localhost):/.test(currentIframeSrc);
    desktopCaptureUrlRef.current =
      isLocalServer && can(Capability.PreviewServer) ? currentIframeSrc : null;
  }, [currentIframeSrc]);

  // SVG preview URL
  const svgPreviewUrl = useMemo(() => {
    if (ext === 'svg' && content) {
      return URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
    }
    return null;
  }, [content, ext]);

  useEffect(() => {
    return () => {
      if (svgPreviewUrl) URL.revokeObjectURL(svgPreviewUrl);
    };
  }, [svgPreviewUrl]);

  if (loading || !editorReady) return null;

  // ── Preview decision (pure) — what does this pane show? ──
  const target = previewFor({
    path,
    viewMode: tab.viewMode,
    mimeType: mime,
    hasFormSchema: !!formSchema,
    hasContent: content !== null,
    hasBlob: blobUrl !== null,
    site,
    previewUrl,
    desktopServed: can(Capability.PreviewServer),
  });
  // Always-on iframe (mounted off-screen outside preview mode for auto-capture)
  const iframeSrc = currentIframeSrc;
  const iframeVisible = target.kind === 'iframe';

  // ── Determine main content ──
  let mainContent: React.ReactNode = null;

  switch (target.kind) {
    case 'form': {
      // Form mode: render schema-based form for config.json
      let parsedData: Record<string, unknown> = {};
      try {
        parsedData = JSON.parse(content ?? '');
      } catch {
        // If JSON is malformed, show an error hint
      }
      mainContent = formSchema ? (
        <TemplateForm schema={formSchema} data={parsedData} onChange={handleFormChange} />
      ) : null;
      break;
    }
    case 'source':
      // Source mode: Monaco Editor
      mainContent = (
        <div className="flex-1 min-h-0">
          <Editor
            key={contentVersion}
            height="100%"
            language={language}
            defaultValue={content ?? ''}
            theme={themeName}
            loading={null}
            onChange={handleEditorChange}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              padding: { top: 8, bottom: 8 },
              renderLineHighlight: 'line',
              bracketPairColorization: { enabled: true },
              guides: { indentation: true, highlightActiveIndentation: true },
              autoIndent: 'full',
              formatOnPaste: true,
              tabSize: 2,
              detectIndentation: false,
            }}
          />
        </div>
      );
      break;
    case 'iframe':
      // The always-on iframe below is the visible content
      break;
    case 'site-status':
      // Rendered below alongside the (absent) iframe
      break;
    case 'loading':
      // HTML preview requested but the preview URL isn't ready yet
      mainContent = (
        <div className="flex-1 flex items-center justify-center">
          <LoadingPanel />
        </div>
      );
      break;
    case 'svg':
      mainContent = svgPreviewUrl ? (
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-preview-bg">
          <img src={svgPreviewUrl} alt={path} className="max-w-full max-h-full object-contain" />
        </div>
      ) : null;
      break;
    case 'markdown':
      mainContent = (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-prose mx-auto text-sm">
            <MarkdownRenderer content={content ?? ''} />
          </div>
        </div>
      );
      break;
    case 'empty':
      // Previewable file with no renderer on this platform
      break;
    case 'image':
      mainContent = blobUrl ? (
        <ImageViewer blobUrl={blobUrl} path={path} artifact={artifact} />
      ) : null;
      break;
    case 'video':
    case 'blob':
      mainContent = blobUrl ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="text-text-muted text-sm">
            Binary file ({mime}, {formatSize(artifact.size)})
          </div>
          <a
            href={blobUrl}
            download={basename(path) || 'file'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-all"
          >
            Download
          </a>
        </div>
      ) : null;
      break;
    case 'unavailable':
      mainContent = (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
          Unable to display this file
        </div>
      );
      break;
  }

  return (
    <>
      {mainContent}
      {/* Desktop: the preview is a real local URL — show it, copy it, open it */}
      {target.kind === 'iframe' && target.localBase && (
        <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-border bg-surface text-[10px] font-mono text-text-muted">
          <span className="truncate flex-1" title={target.localBase}>
            {target.localBase}
          </span>
          <button
            onClick={() => navigator.clipboard?.writeText(target.localBase!)}
            className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:text-text hover:bg-surface-solid transition-colors cursor-pointer"
            title="Copy URL"
          >
            Copy
          </button>
          <button
            onClick={() => {
              import('@/services/desktop').then(({ openExternal }) =>
                openExternal(target.localBase!),
              );
            }}
            className="shrink-0 px-1.5 py-0.5 rounded-[var(--radius-sm)] hover:text-text hover:bg-surface-solid transition-colors cursor-pointer"
            title="Open in browser"
          >
            Open ↗
          </button>
        </div>
      )}
      {/* Site crux: dev server is installing/starting (or failed) */}
      {target.kind === 'site-status' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          {target.phase !== 'error' ? (
            <>
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-text-muted">
                {target.phase === 'installing'
                  ? 'Preparing project (first run installs dependencies)…'
                  : 'Starting dev server…'}
              </p>
              {target.detail && (
                <p className="text-[10px] font-mono text-text-muted/70 max-w-md truncate">
                  {target.detail}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-error">Dev server failed to start</p>
              <pre className="text-[10px] font-mono text-text-muted max-w-md max-h-40 overflow-auto whitespace-pre-wrap text-left">
                {target.detail}
              </pre>
            </>
          )}
        </div>
      )}

      {/* Always-on preview iframe for HTML files — visible in preview mode, off-screen otherwise for auto-capture */}
      {iframeSrc && (
        <iframe
          ref={previewIframeRef}
          key="preview"
          src={iframeSrc}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads allow-forms"
          allow="geolocation; camera; microphone; accelerometer; gyroscope; autoplay; fullscreen"
          onLoad={(e) => {
            try {
              const doc = e.currentTarget.contentDocument;
              if (!doc) return;
              const bg =
                getComputedStyle(doc.documentElement).backgroundColor ||
                getComputedStyle(doc.body).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                e.currentTarget.style.backgroundColor = bg;
              }
            } catch {
              /* cross-origin — ignore */
            }
          }}
          style={
            iframeVisible
              ? { backgroundColor: '#000' }
              : { backgroundColor: '#000', width: CAPTURE_SIZE.width, height: CAPTURE_SIZE.height }
          }
          className={iframeVisible ? 'flex-1 w-full' : 'fixed -left-[9999px] pointer-events-none'}
          title={path}
        />
      )}
    </>
  );
}

// ── Image viewer with lightbox ──

function ImageViewer({
  blobUrl,
  path,
  artifact,
}: {
  blobUrl: string;
  path: string;
  artifact: Artifact;
}) {
  const [dimensions, setDimensions] = useState<string | null>(null);
  const filename = basename(path) || 'image';

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
  }, []);

  return (
    <PhotoProvider>
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center gap-3 bg-preview-bg">
        <PhotoView src={blobUrl}>
          <img
            src={blobUrl}
            alt={path}
            className="max-w-full max-h-[calc(100%-5rem)] object-contain rounded cursor-zoom-in"
            onLoad={handleLoad}
          />
        </PhotoView>
        <div className="flex items-center gap-3 text-[10px] font-mono text-text-muted">
          <span>{filename}</span>
          {dimensions && <span>{dimensions}</span>}
          <span>{formatSize(artifact.size)}</span>
        </div>
      </div>
    </PhotoProvider>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
