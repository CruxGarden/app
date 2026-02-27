import { useEffect, useMemo, useRef, useCallback } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useThemeStore } from '@/stores/themeStore';
import { useUIStore } from '@/stores/uiStore';
import { useFileContent, isImageMime } from '@/hooks/useFileContent';
import { getMonacoLanguage, getExtension, isPreviewable } from '@/lib/monacoLanguages';
import { registerCruxGardenThemes } from '@/lib/monacoTheme';
import { cruxes } from '@/api';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import type { Attachment } from '@/api/types';
import type { EditorTab } from '@/stores/uiStore';
import { Spinner } from '@/components/ui';

interface EditorContentProps {
  tab: EditorTab;
  artifact: Attachment;
  cruxId: string;
  saveRef?: React.MutableRefObject<(() => void) | null>;
}

export default function EditorContent({ tab, artifact, cruxId, saveRef }: EditorContentProps) {
  const { content, blobUrl, loading, setContent } = useFileContent(cruxId, artifact);
  const { setTabDirty } = useUIStore();
  const resolved = useThemeStore((s) => s.resolved);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const contentRef = useRef<string | null>(null);
  const saveHandlerRef = useRef<() => void>(() => {});

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

  // Save handler — reads from ref to avoid re-creating on every keystroke
  const handleSave = useCallback(async () => {
    const current = contentRef.current;
    if (current === null) return;
    const blob = new Blob([current], { type: mime });
    const file = new File([blob], artifact.filename || 'file', { type: mime });
    await cruxes.updateAttachment(artifact.id, file);
    setTabDirty(tab.id, false);
  }, [mime, artifact.id, artifact.filename, tab.id, setTabDirty]);

  // Keep save ref stable for Monaco keybinding (avoids stale closure)
  useEffect(() => {
    saveHandlerRef.current = handleSave;
  }, [handleSave]);

  // Expose save to parent via ref
  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => { if (saveRef) saveRef.current = null; };
  }, [handleSave, saveRef]);

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
      monacoRef.current = monaco;
      editorRef.current = editor;

      registerCruxGardenThemes(monaco);
      monaco.editor.setTheme(themeName);

      // Cmd+S keybinding — uses ref so it always calls the latest save handler
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveHandlerRef.current();
      });
    },
    [themeName],
  );

  // Handle content changes — update ref + state (state needed for preview modes)
  // Using defaultValue means React re-renders won't cause Monaco to re-apply content
  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        contentRef.current = value;
        setContent(value);
        setTabDirty(tab.id, true);
      }
    },
    [tab.id, setContent, setTabDirty],
  );

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

  if (loading) {
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
    // HTML
    if (ext === 'html' || ext === 'htm') {
      return (
        <iframe
          srcDoc={content}
          sandbox="allow-scripts"
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

  // ── Diff mode ──
  if (tab.viewMode === 'diff' && content !== null) {
    return <DiffView content={content} language={language} themeName={themeName} />;
  }

  // ── Image display ──
  if (blobUrl && isImageMime(mime)) {
    return (
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-[rgba(0,0,0,0.2)]">
        <img src={blobUrl} alt={path} className="max-w-full max-h-full object-contain rounded" />
      </div>
    );
  }

  // ── Binary download ──
  if (blobUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <div className="text-text-muted text-sm">
          Binary file ({mime}, {formatSize(artifact.size)})
        </div>
        <a
          href={blobUrl}
          download={path.split('/').pop() || 'file'}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-[var(--radius-sm)] bg-accent text-bg hover:brightness-110 transition-all"
        >
          Download
        </a>
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

// ── Diff subcomponent ──

function DiffView({
  content,
  language,
  themeName,
}: {
  content: string;
  language: string;
  themeName: string;
}) {
  const monacoRef = useRef<typeof Monaco | null>(null);

  // For now, diff against empty — in the future this will diff against gate snapshots
  const handleDiffMount = useCallback(
    (_editor: Monaco.editor.IStandaloneDiffEditor, monaco: typeof Monaco) => {
      monacoRef.current = monaco;
      registerCruxGardenThemes(monaco);
      monaco.editor.setTheme(themeName);
    },
    [themeName],
  );

  const resolved = useThemeStore((s) => s.resolved);
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(
        resolved === 'dark' ? 'crux-garden-dark' : 'crux-garden-light',
      );
    }
  }, [resolved]);

  return (
    <div className="flex-1 min-h-0">
      <DiffEditor
        height="100%"
        language={language}
        original=""
        modified={content}
        theme={themeName}
        onMount={handleDiffMount}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          renderSideBySide: true,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  );
}

function formatSize(bytes?: number): string {
  if (!bytes) return 'unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
