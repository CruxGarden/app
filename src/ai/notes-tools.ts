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
export function notesCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_notebook' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'export_note_docx') {
    const keys = Object.keys(input);
    if (keys.length > 1 || (keys.length === 1 && (keys[0] !== 'note' || typeof input.note !== 'string')))
      throw new Error('Name the note to export as a notebook path, or omit it for the open note.');
    return input.note ? { op: 'export-docx', note: input.note } : { op: 'export-docx' };
  }
  if (name === 'import_document') {
    if (Object.keys(input).length !== 1 || typeof input.path !== 'string' || !/\.docx$/i.test(input.path))
      throw new Error('Name a .docx file in this Crux to import.');
    return { op: 'import-document', path: input.path };
  }
  throw new Error(`Unknown Notes tool ${name}.`);
}
