import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const OPENMOSH_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_openmosh',
    description:
      'Inspect the actual open OpenMosh editor, its effect instances and available parameter constraints. Requires imported or reopened media. Slideshow inspection returns its configuration. Read before editing.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_openmosh_effect',
    description:
      'Change an existing effect in the actual OpenMosh rack using an instanceId from inspect_openmosh. Works in Single mode or a selected static Editor segment/FX clip. Uses native undo and confirms saving with Growth. On error inspect before retrying; a draft may remain.',
    input_schema: {
      type: 'object',
      properties: {
        instanceId: { type: 'string', minLength: 1, maxLength: 100 },
        enabled: { type: 'boolean' },
        values: {
          type: 'object',
          maxProperties: 50,
          additionalProperties: { type: ['number', 'string'] },
        },
      },
      required: ['instanceId'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function openmoshCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_openmosh' && Object.keys(input).length === 0) return { op: 'inspect' };
  if (
    name === 'set_openmosh_effect' &&
    typeof input.instanceId === 'string' &&
    input.instanceId.length > 0 &&
    input.instanceId.length <= 100 &&
    Object.keys(input).every((key) => ['instanceId', 'enabled', 'values'].includes(key)) &&
    (input.enabled === undefined || typeof input.enabled === 'boolean') &&
    (input.values === undefined ||
      (input.values &&
        typeof input.values === 'object' &&
        !Array.isArray(input.values) &&
        Object.keys(input.values).length <= 50 &&
        Object.values(input.values).every(
          (v) =>
            (typeof v === 'string' && v.length <= 4000) ||
            (typeof v === 'number' && Number.isFinite(v)),
        )))
  )
    return { op: 'effect', ...input };
  throw new Error('Inspect OpenMosh, then use a valid effect instance and parameter values.');
}
