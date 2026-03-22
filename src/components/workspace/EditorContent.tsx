/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores/uiStore';
import { useCruxStore } from '@/stores/cruxStore';
import { useFileContent, isImageMime } from '@/hooks/useFileContent';
import { getMonacoLanguage, getExtension, isPreviewable } from '@/lib/monacoLanguages';
import { registerCruxGardenThemes } from '@/lib/monacoTheme';
import { getServices } from '@/services';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import TemplateForm from '@/components/workspace/TemplateForm';
import { usePreviewUrl } from '@/hooks/usePreviewUrl';
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

export default function EditorContent({ tab, artifact, cruxId, saveRef, captureRef }: EditorContentProps) {
  const { content, blobUrl, loading, contentVersion, setContent } = useFileContent(
    cruxId,
    artifact,
  );
  const { setTabDirty, setTabScrollTop } = useUIStore();
  const resolved = useThemeStore((s) => s.resolved);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveHandlerRef = useRef<() => void>(() => {});
  const scrollRafRef = useRef<number | null>(null);
  const disposedRef = useRef(false);
  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const path = artifact.meta?.path || artifact.filename || artifact.id;
  const ext = getExtension(path);
  const mime = artifact.mimeType || 'text/plain';
  const language = getMonacoLanguage(path);
  const themeName = resolved === 'dark' ? 'crux-garden-dark' : 'crux-garden-light';
  const isHtmlFile = ext === 'html' || ext === 'htm';
  const isConfigJson = /^config\.json$/i.test(path.split('/').pop() || '');

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
      await artifactService.upload({
        resourceId: cruxId,
        blob,
        mimeType: mime,
        meta: { path: artifact.meta?.path || artifact.filename || 'file' },
      });
      dirtyRef.current = false;
      setTabDirty(tab.id, false);
      useCruxStore.setState({ hasUnpublishedChanges: true });
    } catch (err: unknown) {
      console.error('Save failed:', err);
    }
  }, [artifact.filename, artifact.meta?.path, mime, tab.id, cruxId, setTabDirty]);

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
  const savePreviewBlob = useCallback((blob: Blob) => {
    const { artifact: artifactService } = getServices();
    const artifacts = useCruxStore.getState().artifacts;
    const existing = artifacts.find((a) => {
      const p = (a.meta?.path || a.filename || '').toLowerCase();
      return p === 'preview.jpg';
    });
    const uploadOpts = { resourceId: cruxId, blob, mimeType: 'image/jpeg', meta: { path: 'preview.jpg' } };
    if (existing) {
      artifactService.upload(uploadOpts)
        .then((updated) => {
          useCruxStore.setState((state) => ({
            artifacts: state.artifacts.map((a) => (a.id === existing.id ? { ...a, ...updated } : a)),
            hasUnpublishedChanges: true,
          }));
        })
        .catch((err) => console.error('Thumbnail save failed:', err));
    } else {
      artifactService.upload(uploadOpts)
        .then((newArt) => {
          useCruxStore.setState((state) => ({
            artifacts: [...state.artifacts, newArt],
            hasUnpublishedChanges: true,
          }));
        })
        .catch((err) => console.error('Thumbnail save failed:', err));
    }
  }, [cruxId]);

  // HTML capture — sends postMessage to preview iframe
  const handleHtmlCapture = useCallback(() => {
    const iframe = previewIframeRef.current;
    if (!iframe?.contentWindow) return;

    const previewOrigin = import.meta.env.VITE_PREVIEW_ORIGIN || window.location.origin;

    function onMessage(e: MessageEvent) {
      if (e.origin !== previewOrigin) return;
      if (!e.data) return;
      if (e.data.type === 'crux:capture-result') {
        window.removeEventListener('message', onMessage);
        savePreviewBlob(new Blob([e.data.buffer], { type: 'image/jpeg' }));
      }
      if (e.data.type === 'crux:capture-error') {
        window.removeEventListener('message', onMessage);
        console.error('Capture failed:', e.data.error);
      }
    }

    window.addEventListener('message', onMessage);
    setTimeout(() => window.removeEventListener('message', onMessage), 10000);
    iframe.contentWindow.postMessage({ type: 'crux:capture' }, previewOrigin);
  }, [savePreviewBlob]);

  // Image capture — scale image to canvas, export as JPEG
  const handleImageCapture = useCallback(() => {
    if (!blobUrl) return;
    const img = new Image();
    img.onload = () => {
      const maxW = 1280, maxH = 900;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob) savePreviewBlob(blob);
      }, 'image/jpeg', 1);
    };
    img.src = blobUrl;
  }, [blobUrl, savePreviewBlob]);

  // Video capture — seek to 1s, grab frame
  const handleVideoCapture = useCallback(() => {
    if (!blobUrl) return;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    video.onloadeddata = () => {
      // Seek to 1s or 0 if shorter
      video.currentTime = Math.min(1, video.duration || 0);
    };
    video.onseeked = () => {
      const maxW = 1280, maxH = 900;
      let w = video.videoWidth, h = video.videoHeight;
      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob) savePreviewBlob(blob);
        URL.revokeObjectURL(video.src);
      }, 'image/jpeg', 1);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
    };

    video.src = blobUrl;
  }, [blobUrl, savePreviewBlob]);

  // Unified capture dispatcher — picks strategy based on file type
  const isImage = isImageMime(mime);
  const isVideo = mime.startsWith('video/');
  const handleCapture = useCallback(() => {
    if (isHtmlFile) handleHtmlCapture();
    else if (isImage) handleImageCapture();
    else if (isVideo) handleVideoCapture();
  }, [isHtmlFile, isImage, isVideo, handleHtmlCapture, handleImageCapture, handleVideoCapture]);

  // Expose capture to parent via ref
  useEffect(() => {
    if (captureRef) captureRef.current = handleCapture;
    return () => {
      if (captureRef) captureRef.current = null;
    };
  }, [handleCapture, captureRef]);

  // Auto-capture: triggered when contentVersion changes (file saved or AI-written)
  const isPreviewFile = path.toLowerCase() === 'preview.jpg';
  const canAutoCapture = isHtmlFile && !isPreviewFile;
  const autoCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialVersionRef = useRef(contentVersion);
  useEffect(() => {
    // Skip the initial load — only capture on subsequent version changes
    if (contentVersion <= initialVersionRef.current) return;
    if (!canAutoCapture) return;

    // HTML needs longer delay for iframe to settle; image/video are instant
    const delay = isHtmlFile ? 3000 : 500;
    if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
    autoCaptureTimerRef.current = setTimeout(() => {
      handleCapture();
    }, delay);

    return () => {
      if (autoCaptureTimerRef.current) clearTimeout(autoCaptureTimerRef.current);
    };
  }, [contentVersion, canAutoCapture, isHtmlFile, handleCapture]);

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

  // HTML preview via service worker virtual file server
  // Always enabled for HTML files so the background iframe stays warm for auto-capture
  const previewUrl = usePreviewUrl(content, cruxId, path, isHtmlFile);

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

  const isInPreviewMode = tab.viewMode === 'preview';
  const showPreviewIframe = isHtmlFile && isInPreviewMode && previewUrl;

  // ── Determine main content ──
  let mainContent: React.ReactNode = null;

  if (tab.viewMode === 'form' && isConfigJson && formSchema && content !== null) {
    // Form mode: render schema-based form for config.json
    let parsedData: Record<string, unknown> = {};
    try {
      parsedData = JSON.parse(content);
    } catch {
      // If JSON is malformed, show an error hint
    }
    mainContent = (
      <TemplateForm schema={formSchema} data={parsedData} onChange={handleFormChange} />
    );
  } else if (tab.viewMode === 'source' && content !== null) {
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
  } else if (isInPreviewMode && content !== null && isPreviewable(path)) {
    if (isHtmlFile) {
      // HTML preview — handled by the always-on iframe below
      if (!previewUrl) {
        mainContent = (
          <div className="flex-1 flex items-center justify-center">
            <LoadingPanel />
          </div>
        );
      }
      // else: mainContent stays null, the iframe below is the visible content
    } else if (ext === 'svg' && svgPreviewUrl) {
      mainContent = (
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-preview-bg">
          <img src={svgPreviewUrl} alt={path} className="max-w-full max-h-full object-contain" />
        </div>
      );
    } else if (ext === 'md' || ext === 'mdx') {
      mainContent = (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-prose mx-auto text-sm">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      );
    }
  } else if (blobUrl && isImageMime(mime)) {
    mainContent = <ImageViewer blobUrl={blobUrl} path={path} artifact={artifact} />;
  } else if (blobUrl) {
    mainContent = (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <div className="text-text-muted text-sm">
          Binary file ({mime}, {formatSize(artifact.size)})
        </div>
        <a
          href={blobUrl}
          download={path.split('/').pop() || 'file'}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent-muted text-accent border border-accent/20 hover:border-accent transition-all"
        >
          Download
        </a>
      </div>
    );
  } else {
    mainContent = (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Unable to display this file
      </div>
    );
  }

  return (
    <>
      {mainContent}
      {/* Always-on preview iframe for HTML files — visible in preview mode, off-screen otherwise for auto-capture */}
      {isHtmlFile && previewUrl && (
        <iframe
          ref={previewIframeRef}
          key="preview"
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin allow-popups allow-modals"
          allow="geolocation; camera; microphone; accelerometer; gyroscope; autoplay; fullscreen"
          onLoad={(e) => {
            try {
              const doc = e.currentTarget.contentDocument;
              if (!doc) return;
              const bg = getComputedStyle(doc.documentElement).backgroundColor
                || getComputedStyle(doc.body).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                e.currentTarget.style.backgroundColor = bg;
              }
            } catch { /* cross-origin — ignore */ }
          }}
          style={{ backgroundColor: '#000' }}
          className={showPreviewIframe
            ? 'flex-1 w-full'
            : 'fixed -left-[9999px] w-[1280px] h-[900px] pointer-events-none'
          }
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
  const filename = path.split('/').pop() || 'image';

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
