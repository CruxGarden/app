import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const GDEVELOP_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_gdevelop',
    description: 'Inspect the native game name and first 100 scenes with object and event counts.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_gdevelop_name',
    description: 'Name the native GDevelop game and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_gdevelop_background',
    description: 'Set the background color of an existing native scene and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: {
        scene: { type: 'string', minLength: 1, maxLength: 200 },
        rgb: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: { type: 'integer', minimum: 0, maximum: 255 },
        },
      },
      required: ['scene', 'rgb'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function gdevelopCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_gdevelop' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name === 'set_gdevelop_name' &&
    Object.keys(input).length === 1 &&
    typeof input.name === 'string' &&
    input.name.trim() &&
    input.name.length <= 200
  )
    return { op: 'set-name', name: input.name };
  if (
    name === 'set_gdevelop_background' &&
    Object.keys(input).length === 2 &&
    typeof input.scene === 'string' &&
    input.scene.trim() &&
    input.scene.length <= 200 &&
    Array.isArray(input.rgb) &&
    input.rgb.length === 3 &&
    input.rgb.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
  )
    return { op: 'set-background', scene: input.scene, rgb: input.rgb };
  throw new Error('Choose a game name or an existing scene and three RGB integers from 0 to 255.');
}
