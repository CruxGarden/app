import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const BITSY_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_bitsy',
    description: 'Inspect the open Bitsy game title and room, sprite, item and dialogue IDs.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_bitsy_title',
    description:
      'Set the Bitsy game title using the native editor and a confirmed Garden save. Stop play mode first.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string', maxLength: 300 } },
      required: ['title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function bitsyCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_bitsy' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'set_bitsy_title' ||
    Object.keys(input).length !== 1 ||
    typeof input.title !== 'string' ||
    !input.title.trim() ||
    input.title.length > 300
  )
    throw new Error('Choose a Bitsy title up to 300 characters.');
  return { op: 'title', title: input.title };
}
