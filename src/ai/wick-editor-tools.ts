import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const WICK_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_wick',
    description: 'Inspect the open Wick Editor project: name, frame rate, size, background colour, frames, layers and assets.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_wick_name',
    description: 'Set the project name (up to 200 characters) and save the .wick file.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
  {
    name: 'set_wick_framerate',
    description: 'Set the project frame rate (1 to 120 frames per second) and save. Never plays the preview.',
    input_schema: {
      type: 'object',
      properties: { framerate: { type: 'integer', minimum: 1, maximum: 120 } },
      required: ['framerate'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'data/assets/'],
  },
];
export function wickCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_wick' && !keys.length) return { op: 'inspect' };
  if (name === 'set_wick_name') {
    const value = input.name;
    if (keys.length !== 1 || typeof value !== 'string' || !value.trim() || value.length > 200)
      throw new Error('Use a project name up to 200 characters.');
    return { op: 'set-name', name: value.trim() };
  }
  if (name === 'set_wick_framerate') {
    const fps = input.framerate;
    if (keys.length !== 1 || !Number.isInteger(fps) || (fps as number) < 1 || (fps as number) > 120)
      throw new Error('Choose a whole frame rate from 1 to 120.');
    return { op: 'set-framerate', framerate: fps };
  }
  throw new Error('Choose a supported Wick Editor operation.');
}
