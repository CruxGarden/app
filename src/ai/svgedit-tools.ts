import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const SVGEDIT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_svgedit',
    description:
      'Read the drawing title, dimensions, object count and the first 200 editable shape IDs and fills.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_svgedit_title',
    description: 'Set the native drawing title and save in Garden.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', minLength: 1, maxLength: 300 } },
      required: ['title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_svgedit_fill',
    description:
      'Change one existing shape fill through native undoable editing. Use a six-digit hex color or none.',
    input_schema: {
      type: 'object',
      properties: {
        elementId: { type: 'string', minLength: 1, maxLength: 300 },
        color: { type: 'string', pattern: '^(#[a-fA-F0-9]{6}|none)$' },
      },
      required: ['elementId', 'color'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function svgeditCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_svgedit' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name === 'set_svgedit_title' &&
    Object.keys(input).length === 1 &&
    typeof input.title === 'string' &&
    input.title.trim() &&
    input.title.length <= 300
  )
    return { op: 'set-title', title: input.title };
  if (
    name === 'set_svgedit_fill' &&
    Object.keys(input).length === 2 &&
    typeof input.elementId === 'string' &&
    input.elementId &&
    input.elementId.length <= 300 &&
    typeof input.color === 'string' &&
    /^(#[a-fA-F0-9]{6}|none)$/.test(input.color)
  )
    return { op: 'set-fill', elementId: input.elementId, color: input.color };
  throw new Error('Choose an existing drawing object and a valid bounded edit.');
}
