import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const MINIPAINT_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_minipaint',
    description: 'Inspect the open miniPaint canvas and its native layer IDs and properties.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'update_minipaint_layer',
    description:
      'Change a native miniPaint layer through its undo action and confirmed Garden save. Inspect first.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
        visible: { type: 'boolean' },
        opacity: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['id'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function minipaintCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_minipaint') return { op: 'inspect' };
  if (
    name !== 'update_minipaint_layer' ||
    !Number.isSafeInteger(input.id) ||
    Object.keys(input).some((key) => !['id', 'name', 'visible', 'opacity'].includes(key))
  )
    throw new Error('Inspect miniPaint and choose a valid layer.');
  if (
    (input.name !== undefined && (typeof input.name !== 'string' || input.name.length > 200)) ||
    (input.visible !== undefined && typeof input.visible !== 'boolean') ||
    (input.opacity !== undefined &&
      (typeof input.opacity !== 'number' ||
        !Number.isFinite(input.opacity) ||
        input.opacity < 0 ||
        input.opacity > 100))
  )
    throw new Error('Choose a valid layer name, visibility or opacity.');
  if (Object.keys(input).length < 2) throw new Error('Choose a property to update.');
  return { op: 'layer', ...input };
}
