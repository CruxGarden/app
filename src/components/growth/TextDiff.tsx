// The pinned, bundled Monaco and its workers (never the wrapper's CDN loader).
import '@/lib/monaco-editor';
import * as monaco from 'monaco-editor';
import { useEffect, useRef } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { getMonacoLanguage } from '@/lib/monacoLanguages';
import {
  readEditorFontFamily,
  readEditorFontSize,
  registerCruxGardenThemes,
} from '@/lib/monacoTheme';

/**
 * A read-only text comparison: side by side, inline when the view is narrow.
 * It wears the Mood's editor theme like the editor does. The widget and its two
 * models are created and disposed here, in that order, so nothing outlives it.
 */
export default function TextDiff({
  original,
  modified,
  path,
}: {
  original: string;
  modified: string;
  path: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const activeMode = useThemeStore((s) => s.activeMode);
  const themeName = activeMode === 'dark' ? 'crux-garden-dark' : 'crux-garden-light';

  useEffect(() => {
    if (!host.current) return;
    registerCruxGardenThemes(monaco);
    monaco.editor.setTheme(themeName);
    const language = getMonacoLanguage(path);
    const before = monaco.editor.createModel(original, language);
    const after = monaco.editor.createModel(modified, language);
    const editor = monaco.editor.createDiffEditor(host.current, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: true,
      renderSideBySideInlineBreakpoint: 720,
      renderOverviewRuler: false,
      minimap: { enabled: false },
      fontSize: readEditorFontSize(),
      fontFamily: readEditorFontFamily(),
      scrollBeyondLastLine: false,
      diffWordWrap: 'on',
      padding: { top: 8, bottom: 8 },
    });
    editor.setModel({ original: before, modified: after });
    const restyle = () => {
      registerCruxGardenThemes(monaco);
      monaco.editor.setTheme(themeName);
      editor.updateOptions({
        fontSize: readEditorFontSize(),
        fontFamily: readEditorFontFamily(),
      });
    };
    document.addEventListener('palette-change', restyle);
    return () => {
      document.removeEventListener('palette-change', restyle);
      editor.dispose();
      before.dispose();
      after.dispose();
    };
  }, [original, modified, path, themeName]);

  return <div ref={host} className="h-full w-full" data-testid="compare-diff" />;
}
