/** Garden edits use the same ProseMirror transactions as typing and Replace. */
import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
export function editOpenNote(editor: Editor, command: Record<string, unknown>) {
  if (!editor.isEditable) throw new Error('The open note is read-only.');
  if (command.op === 'replace-text') {
    const search = command.search;
    const replacement = command.replacement;
    if (typeof search !== 'string' || !search || search.length > 2000 || typeof replacement !== 'string' || replacement.length > 2000 || /[\r\n]/.test(search + replacement))
      throw new Error('Replace a single paragraph’s text using search and replacement up to 2,000 characters.');
    const matches: { from: number; to: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      const text = node.textBetween(0, node.content.size, '\n', '\uFFFC');
      let at = text.indexOf(search);
      while (at >= 0) {
        matches.push({ from: pos + 1 + at, to: pos + 1 + at + search.length });
        at = text.indexOf(search, at + 1);
      }
      return false;
    });
    if (matches.length !== 1) throw new Error(matches.length ? 'This text appears more than once. Supply a longer unique phrase.' : 'The exact text was not found within one paragraph. Read the open note again.');
    editor.view.dispatch(closeHistory(editor.state.tr).insertText(replacement, matches[0].from, matches[0].to));
  } else if (command.op === 'append-text') {
    if (typeof command.text !== 'string' || !command.text.trim() || command.text.length > 8000) throw new Error('Append plain text of 1–8,000 characters.');
    const paragraphs = command.text.replace(/\r\n?/g, '\n').split('\n').map(text => editor.schema.nodes.paragraph.create(null, text ? editor.schema.text(text) : null));
    editor.view.dispatch(closeHistory(editor.state.tr).insert(editor.state.doc.content.size, paragraphs));
  } else throw new Error('Unknown note edit.');
  // Keep a following person's keystrokes in their own Undo step as well.
  editor.view.dispatch(closeHistory(editor.state.tr));
}
