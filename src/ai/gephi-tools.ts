import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const GEPHI_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_gephi',
    description: 'Read the native network title, node/edge counts, fields and filter count.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_gephi_title',
    description: 'Set the native graph title and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', maxLength: 300 } },
      required: ['title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function gephiCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_gephi' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'set_gephi_title' ||
    Object.keys(input).length !== 1 ||
    typeof input.title !== 'string' ||
    input.title.length > 300
  )
    throw new Error('Choose a graph title up to 300 characters.');
  return { op: 'set-title', title: input.title };
}
