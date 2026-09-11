import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const BLOCKBENCH_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_blockbench',
    description:
      'Inspect the model library and first 200 active model elements, textures and animations.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_blockbench_name',
    description: 'Name the active native model and save in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rename_blockbench_element',
    description: 'Rename an existing model element through native undoable editing.',
    input_schema: {
      type: 'object',
      properties: {
        elementId: { type: 'string', minLength: 1, maxLength: 100 },
        name: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['elementId', 'name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function blockbenchCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_blockbench' && !Object.keys(input).length) return { op: 'inspect' };
  if (typeof input.name === 'string' && input.name.trim() && input.name.length <= 200) {
    if (name === 'set_blockbench_name' && Object.keys(input).length === 1)
      return { op: 'set-name', name: input.name };
    if (
      name === 'rename_blockbench_element' &&
      Object.keys(input).length === 2 &&
      typeof input.elementId === 'string' &&
      input.elementId.length > 0 &&
      input.elementId.length <= 100
    )
      return { op: 'rename-element', elementId: input.elementId, name: input.name };
  }
  throw new Error('Choose an existing model element and a name up to 200 characters.');
}
