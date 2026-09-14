import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
/** Tigrana Notes App Tools: read the notebook, bring a Word document in, hand a note out as one. */
export const NOTES_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_notebook',
    description:
      'List the notes in this Tigrana notebook (paths and titles), the note that is open, and the public edition choices.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'export_note_docx',
    description:
      'Write a note as a Word document (.docx) and save it as a named output of this Crux (exports/), so a person can hand it on or a Cruxspace member can use it. Omit note to export the open note.',
    input_schema: {
      type: 'object',
      properties: { note: { type: 'string', minLength: 1, maxLength: 240 } },
      required: [],
      additionalProperties: false,
    },
    writes: ['exports/'],
  },
  {
    name: 'save_notebook_book',
    description:
      'Build the book edition — the notes chosen for the public edition as an EPUB — and save it as a named output of this Crux (exports/). The notebook must have “Web pages and an EPUB book” chosen under its sharing settings and at least one public note.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: ['exports/', 'dist/'],
    timeoutMs: 10 * 60_000,
  },
  {
    name: 'import_document',
    description:
      'Import a Word document (.docx) that is already a file in this Crux into the notebook as a note under notebook/Imported/<name>/, with its images. The app reloads afterwards.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', minLength: 1, maxLength: 240 } },
      required: ['path'],
      additionalProperties: false,
    },
    writes: ['notebook/Imported/'],
  },
];
const notePath = {
  type: 'string',
  minLength: 1,
  maxLength: 240,
  description: 'The activeNote path from inspect_notebook, relative to notebook/.',
};
for (const [name, description, properties, required, writes] of [
  [
    'read_open_note',
    'Read 4,000 characters of Markdown from the live open note. Returns nextOffset for pagination.',
    { note: notePath, offset: { type: 'integer', minimum: 0 } },
    ['note'],
    [],
  ],
  [
    'replace_note_text',
    'Replace one exact, unique phrase within a paragraph in the open note. Retains surrounding formatting and native Undo. Read first; ambiguous or missing text is refused.',
    {
      note: notePath,
      search: { type: 'string', minLength: 1, maxLength: 2000 },
      replacement: { type: 'string', maxLength: 2000 },
    },
    ['note', 'search', 'replacement'],
    ['notebook/'],
  ],
  [
    'append_note_text',
    'Append plain text as new paragraphs to the open note. Newlines separate paragraphs; text is not interpreted as HTML or Markdown. Retains native Undo.',
    { note: notePath, text: { type: 'string', minLength: 1, maxLength: 8000 } },
    ['note', 'text'],
    ['notebook/'],
  ],
] as const)
  NOTES_TOOLS.push({
    name,
    description,
    input_schema: {
      type: 'object',
      properties,
      required: [...required],
      additionalProperties: false,
    },
    writes: [...writes],
  });

export function notesCommand(name: string, input: Record<string, unknown>) {
  const editOp: Record<string, string> = {
    read_open_note: 'read-note',
    replace_note_text: 'replace-text',
    append_note_text: 'append-text',
  };
  if (editOp[name]) {
    const allowed =
      name === 'read_open_note'
        ? ['note', 'offset']
        : name === 'replace_note_text'
          ? ['note', 'search', 'replacement']
          : ['note', 'text'];
    if (
      Object.keys(input).some((k) => !allowed.includes(k)) ||
      typeof input.note !== 'string' ||
      input.note.length > 240 ||
      !input.note.endsWith('.md') ||
      input.note.split('/').some((p) => !p || p === '.' || p === '..') ||
      input.note.includes('\\') ||
      [...input.note].some((c) => c.charCodeAt(0) < 32)
    )
      throw new Error('Use the activeNote path from inspect_notebook and the documented inputs.');
    if (
      name === 'read_open_note' &&
      input.offset !== undefined &&
      (!Number.isSafeInteger(input.offset) || Number(input.offset) < 0)
    )
      throw new Error('Use a nonnegative integer offset.');
    if (
      name === 'replace_note_text' &&
      (typeof input.search !== 'string' ||
        !input.search ||
        input.search.length > 2000 ||
        typeof input.replacement !== 'string' ||
        input.replacement.length > 2000 ||
        /[\r\n]/.test(input.search + input.replacement))
    )
      throw new Error(
        'Use search and replacement text within one paragraph, up to 2,000 characters.',
      );
    if (
      name === 'append_note_text' &&
      (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 8000)
    )
      throw new Error('Append plain text of 1–8,000 characters.');
    return { ...input, op: editOp[name] };
  }
  if (name === 'inspect_notebook' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'export_note_docx') {
    const keys = Object.keys(input);
    if (
      keys.length > 1 ||
      (keys.length === 1 && (keys[0] !== 'note' || typeof input.note !== 'string'))
    )
      throw new Error('Name the note to export as a notebook path, or omit it for the open note.');
    return input.note ? { op: 'export-docx', note: input.note } : { op: 'export-docx' };
  }
  if (name === 'save_notebook_book') {
    if (Object.keys(input).length) throw new Error('The book takes no arguments.');
    return { op: 'save-book' };
  }
  if (name === 'import_document') {
    if (
      Object.keys(input).length !== 1 ||
      typeof input.path !== 'string' ||
      !/\.docx$/i.test(input.path)
    )
      throw new Error('Name a .docx file in this Crux to import.');
    return { op: 'import-document', path: input.path };
  }
  throw new Error(`Unknown Notes tool ${name}.`);
}
