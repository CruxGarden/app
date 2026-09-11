import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const PISKEL_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_piskel',
    description: 'Read the open sprite dimensions, layers, frame count and animation speed.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_piskel_speed',
    description:
      'Change the open Piskel animation speed through its native controller and save in Garden.',
    input_schema: {
      type: 'object',
      properties: { fps: { type: 'integer', minimum: 1, maximum: 24 } },
      required: ['fps'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function piskelCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_piskel' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'set_piskel_speed' ||
    Object.keys(input).length !== 1 ||
    !Number.isInteger(input.fps) ||
    (input.fps as number) < 1 ||
    (input.fps as number) > 24
  )
    throw new Error('Choose an animation speed from 1 to 24 frames per second.');
  return { op: 'fps', fps: input.fps };
}
