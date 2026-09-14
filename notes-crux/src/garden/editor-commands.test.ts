// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { editOpenNote } from './editor-commands';
describe('Garden native note edits', () => {
  it('replaces across inline formatting and undoes independently', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>The <strong>budget</strong> is 120.</p><p>Keep <em>this</em>.</p>' });
    editOpenNote(editor, { op: 'replace-text', search: 'budget is 120', replacement: 'budget is 180' });
    expect(editor.getText()).toContain('budget is 180');
    expect(editor.getHTML()).toContain('<em>this</em>');
    editOpenNote(editor, { op: 'append-text', text: 'Next steps\n<literal text>' });
    expect(editor.getText()).toContain('<literal text>');
    editor.commands.undo();
    expect(editor.getText()).not.toContain('Next steps');
    expect(editor.getText()).toContain('budget is 180');
    editor.commands.undo();
    expect(editor.getHTML()).toContain('<strong>budget</strong> is 120');
    editor.destroy();
  });
  it('refuses ambiguous or missing text without modifying the document', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>Repeat Repeat</p>' });
    const before = editor.getHTML();
    for (const search of ['Repeat', 'repeat', 'missing']) expect(() => editOpenNote(editor, { op: 'replace-text', search, replacement: 'x' })).toThrow();
    expect(editor.getHTML()).toBe(before);
    editor.setEditable(false);
    expect(() => editOpenNote(editor, { op: 'append-text', text: 'x' })).toThrow();
    editor.destroy();
  });
});
