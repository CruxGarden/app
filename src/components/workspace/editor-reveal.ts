import type * as Monaco from 'monaco-editor';

/**
 * "Open this file at that line, with the match selected" (find in files).
 * The request waits by Artifact id until that file's source editor is on
 * screen: an editor already showing it answers the event at once; one that
 * mounts later picks the request up as it mounts.
 */
export interface EditorReveal {
  /** 1-based line and column, and how many characters to select. */
  line: number;
  column: number;
  length: number;
}

const EVENT = 'crux:editor-reveal';
const pending = new Map<string, EditorReveal>();

export function requestEditorReveal(artifactId: string, reveal: EditorReveal): void {
  pending.set(artifactId, reveal);
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { artifactId } }));
}

export function takeEditorReveal(artifactId: string): EditorReveal | undefined {
  const reveal = pending.get(artifactId);
  pending.delete(artifactId);
  return reveal;
}

/** Hear requests for one file. Returns the unsubscribe. */
export function onEditorReveal(artifactId: string, listener: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<{ artifactId: string }>).detail?.artifactId === artifactId)
      listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

/** The selection a request asks for, kept inside the text that is really there. */
export function revealRange(
  reveal: EditorReveal,
  lineCount: number,
  lineLength: (line: number) => number,
) {
  const line = Math.min(Math.max(1, reveal.line), Math.max(1, lineCount));
  const end = lineLength(line) + 1;
  const startColumn = Math.min(Math.max(1, reveal.column), end);
  const endColumn = Math.min(startColumn + Math.max(0, reveal.length), end);
  return { startLineNumber: line, startColumn, endLineNumber: line, endColumn };
}

export function applyEditorReveal(
  editor: Monaco.editor.IStandaloneCodeEditor,
  reveal: EditorReveal,
): void {
  const model = editor.getModel();
  if (!model) return;
  const range = revealRange(reveal, model.getLineCount(), (line) => model.getLineLength(line));
  editor.setSelection(range);
  editor.revealRangeInCenter(range);
  editor.focus();
}
