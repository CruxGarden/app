import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const OPENCUT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_opencut',
    description:
      'Inspect the open video project, scenes and first 100 timeline elements/media assets. Timeline times are native ticks (120,000 per second); media durations are seconds.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_opencut_name',
    description: 'Name the open native video project and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_opencut_text',
    description:
      'Change the content of an existing text element in the active scene through native undoable editing. Inspect first to obtain its ID.',
    input_schema: {
      type: 'object',
      properties: {
        elementId: { type: 'string', minLength: 1, maxLength: 100 },
        content: { type: 'string', maxLength: 10000 },
      },
      required: ['elementId', 'content'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function opencutCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_opencut' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name === 'set_opencut_name' &&
    Object.keys(input).length === 1 &&
    typeof input.name === 'string' &&
    input.name.trim() &&
    input.name.length <= 200
  )
    return { op: 'set-name', name: input.name };
  if (
    name === 'set_opencut_text' &&
    Object.keys(input).length === 2 &&
    typeof input.elementId === 'string' &&
    input.elementId.length > 0 &&
    input.elementId.length <= 100 &&
    typeof input.content === 'string' &&
    input.content.length <= 10000
  )
    return { op: 'set-text', elementId: input.elementId, content: input.content };
  throw Error('Choose an existing text element and supported video edit.');
}
