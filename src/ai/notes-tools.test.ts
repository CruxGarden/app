import { describe, it, expect } from 'vitest';
import { notesCommand, NOTES_TOOLS } from './notes-tools';
import { embeddedAppToolAdapter } from '@/services/embedded-app-tool-adapters';

describe('Notes App Tools', () => {
  it('a Notes Crux gets the notebook tools', () => {
    const adapter = embeddedAppToolAdapter({ kind: 'notes', meta: { template: 'notes' } })!;
    expect(adapter.tools.map((t) => t.name)).toEqual([
      'inspect_notebook',
      'export_note_docx',
      'save_notebook_book',
      'import_document',
      'read_open_note',
      'replace_note_text',
      'append_note_text',
    ]);
    expect(NOTES_TOOLS.find((t) => t.name === 'export_note_docx')!.writes).toEqual(['exports/']);
    expect(notesCommand('save_notebook_book', {})).toEqual({ op: 'save-book' });
    expect(() => notesCommand('save_notebook_book', { note: 'x' })).toThrow(/no arguments/);
  });
  it('prepares the bridge commands and refuses bad input', () => {
    expect(notesCommand('inspect_notebook', {})).toEqual({ op: 'inspect' });
    expect(notesCommand('export_note_docx', {})).toEqual({ op: 'export-docx' });
    expect(notesCommand('export_note_docx', { note: 'Imported/Letter/Letter.md' })).toEqual({
      op: 'export-docx',
      note: 'Imported/Letter/Letter.md',
    });
    expect(() => notesCommand('export_note_docx', { note: 3 })).toThrow('Name the note');
    expect(notesCommand('import_document', { path: 'inbox/Letter.docx' })).toEqual({
      op: 'import-document',
      path: 'inbox/Letter.docx',
    });
    expect(() => notesCommand('import_document', { path: 'inbox/letter.txt' })).toThrow('.docx');
  });
});

it('bounds live note edits and requires a scoped notebook path', () => {
  expect(
    notesCommand('replace_note_text', { note: 'Brief.md', search: '120', replacement: '180' }),
  ).toMatchObject({ op: 'replace-text' });
  for (const note of ['../Brief.md', '/Brief.md', 'a\\Brief.md', 'Brief.md\n', ''])
    expect(() => notesCommand('read_open_note', { note })).toThrow();
  expect(() =>
    notesCommand('replace_note_text', { note: 'Brief.md', search: 'one\ntwo', replacement: 'x' }),
  ).toThrow();
  expect(() =>
    notesCommand('append_note_text', { note: 'Brief.md', text: 'x'.repeat(8001) }),
  ).toThrow();
  expect(() => notesCommand('read_open_note', { note: 'Brief.md', offset: -1 })).toThrow();
});
