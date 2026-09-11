import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const JUPYTERLITE_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_jupyterlite',
    description:
      'Read the active notebook path and its cell sources from the native notebook model.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'append_jupyterlite_cell',
    description:
      'Append a code or Markdown cell to the active native notebook and save it. Code cells are not executed automatically.',
    input_schema: {
      type: 'object',
      properties: {
        cellType: { type: 'string', enum: ['code', 'markdown'] },
        source: { type: 'string', maxLength: 20000 },
      },
      required: ['cellType', 'source'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function jupyterliteCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_jupyterlite' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'append_jupyterlite_cell' ||
    Object.keys(input).length !== 2 ||
    !['code', 'markdown'].includes(input.cellType as string) ||
    typeof input.source !== 'string' ||
    input.source.length > 20000
  )
    throw new Error('Choose a code or Markdown cell up to 20,000 characters.');
  return { op: 'append-cell', cellType: input.cellType, source: input.source };
}
