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
import { cruxes } from '@/api';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { usePreviewUrl } from '@/hooks/usePreviewUrl';
import type { Attachment } from '@/api/types';
import type { EditorTab } from '@/stores/uiStore';
import { Spinner } from '@/components/ui';

// ── Save handler registry (module-level, accessible from outside) ──
const editorSaveHandlers = new Map<string, () => Promise<void>>();

/** Save all dirty editors. Awaitable — resolves when all saves complete. */
export async function saveAllDirtyEditors(): Promise<void> {
  const promises = Array.from(editorSaveHandlers.values()).map((fn) => fn());
  await Promise.all(promises);
}

interface EditorContentProps {
  tab: EditorTab;
  artifact: Attachment;
  cruxId: string;
  saveRef?: React.MutableRefObject<(() => void) | null>;
}

export default function EditorContent({ tab, artifact, cruxId, saveRef }: EditorContentProps) {
  const { content, blobUrl, loading, contentVersion, setContent, refetch } = useFileContent(cruxId, artifact);
  const { setTabDirty, setTabScrollTop } = useUIStore();
  const resolved = useThemeStore((s) => s.resolved);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveHandlerRef = useRef<() => void>(() => {});
  const scrollRafRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  const path = artifact.meta?.path || artifact.filename || artifact.id;
  const ext = getExtension(path);
  const mime = artifact.mimeType || 'text/plain';
  const language = getMonacoLanguage(path);
  const themeName = resolved === 'dark' ? 'crux-garden-dark' : 'crux-garden-light';

  // Keep ref in sync when content loads
  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  // Sync theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(themeName);
    }
  }, [themeName]);

  // Save handler — calls API directly (no store dependency, survives reset)
  const handleSave = useCallback(async () => {
    const current = contentRef.current;
    if (current === null || !dirtyRef.current) return;
    try {
      const blob = new Blob([current], { type: mime });
      const file = new File([blob], artifact.filename || 'file', { type: mime });
      await cruxes.updateAttachment(artifact.id, file);
      dirtyRef.current = false;
      setTabDirty(tab.id, false);
      useCruxStore.setState({ hasUnpublishedChanges: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      console.error('Save failed:', axiosErr.response?.data?.message ?? err);
    }
  }, [artifact.id, artifact.filename, mime, tab.id, setTabDirty]);

  // Keep save ref stable for Monaco keybinding (avoids stale closure)
  useEffect(() => {
    saveHandlerRef.current = handleSave;
  }, [handleSave]);

  // Register save handler in module-level map (for saveAllDirtyEditors)
  useEffect(() => {
    editorSaveHandlers.set(tab.id, handleSave);
    return () => { editorSaveHandlers.delete(tab.id); };
  }, [tab.id, handleSave]);

  // Expose save to parent via ref
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => { if (saveRef) saveRef.current = null; };
  }, [handleSave, saveRef]);

  // Defer Monaco mount by one frame so any disposed editor's async cleanup
  // (rAF, rIC) completes before the new editor tries to initialise
  const [editorReady, setEditorReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEditorReady(true));
    return () => { cancelAnimationFrame(id); setEditorReady(false); };
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
      monaco.editor.setTheme(themeName);

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
  const isHtmlPreview = tab.viewMode === 'preview' && (ext === 'html' || ext === 'htm');
  const previewUrl = usePreviewUrl(content, cruxId, path, isHtmlPreview);

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

  if (loading || !editorReady) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={24} />
      </div>
    );
  }

  // ── Source mode: Monaco Editor ──
  if (tab.viewMode === 'source' && content !== null) {
    return (
      <div className="flex-1 min-h-0">
        <Editor
          key={contentVersion}
          height="100%"
          language={language}
          defaultValue={content ?? ''}
          theme={themeName}
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
            autoIndent: 'full',
            formatOnPaste: true,
            tabSize: 2,
          }}
        />
      </div>
    );
  }

  // ── Preview mode ──
  if (tab.viewMode === 'preview' && content !== null && isPreviewable(path)) {
    // HTML — served by preview service worker
    if (ext === 'html' || ext === 'htm') {
      if (!previewUrl) {
        return (
          <div className="flex-1 flex items-center justify-center">
            <Spinner size={24} />
          </div>
        );
      }
      return (
        <iframe
          key={previewUrl}
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin"
          className="flex-1 w-full bg-white"
          title={path}
        />
      );
    }

    // SVG
    if (ext === 'svg' && svgPreviewUrl) {
      return (
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[rgba(0,0,0,0.2)]">
          <img src={svgPreviewUrl} alt={path} className="max-w-full max-h-full object-contain" />
        </div>
      );
    }

    // Markdown
    if (ext === 'md' || ext === 'mdx') {
      return (
        <div className="flex-1 overflow-auto p-4">
          <div className="max-w-prose mx-auto text-sm">
            <MarkdownRenderer content={content} />
          </div>
        </div>
      );
    }
  }

  // ── Image display ──
  if (blobUrl && isImageMime(mime)) {
    return <ImageViewer blobUrl={blobUrl} path={path} artifact={artifact} />;
  }

  // ── Binary download ──
  if (blobUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <div className="text-text-muted text-sm">
          Binary file ({mime}, {formatSize(artifact.size)})
        </div>
        <div className="flex items-center gap-2">
          <a
            href={blobUrl}
            download={path.split('/').pop() || 'file'}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent text-bg hover:brightness-110 transition-all"
          >
            Download
          </a>
          <ReplaceFileButton artifactId={artifact.id} onReplaced={refetch} />
        </div>
      </div>
    );
  }

  // ── Fallback ──
  return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
      Unable to display this file
    </div>
  );
}

// ── Image viewer with lightbox ──

function ImageViewer({ blobUrl, path, artifact }: { blobUrl: string; path: string; artifact: Attachment }) {
  const [dimensions, setDimensions] = useState<string | null>(null);
  const filename = path.split('/').pop() || 'image';

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`);
  }, []);

  return (
    <PhotoProvider>
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-center gap-3 bg-[rgba(0,0,0,0.2)]">
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

// ── Replace file button ──

function ReplaceFileButton({ artifactId, onReplaced }: { artifactId: string; onReplaced: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState(false);
  const updateArtifact = useCruxStore((s) => s.updateArtifact);

  const handleReplace = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReplacing(true);
    try {
      const updated = await cruxes.updateAttachment(artifactId, file);
      updateArtifact(artifactId, updated);
      useCruxStore.setState({ hasUnpublishedChanges: true });
      onReplaced();
    } catch (err) {
      console.error('Replace failed:', err);
    } finally {
      setReplacing(false);
      e.target.value = '';
    }
  }, [artifactId, updateArtifact, onReplaced]);

  return (
    <>
      <input ref={inputRef} type="file" className="hidden" onChange={handleReplace} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={replacing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border border-border text-text-muted hover:text-text hover:bg-surface transition-colors disabled:opacity-50"
      >
        {replacing ? (
          <Spinner size={12} />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
        Replace
      </button>
    </>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
