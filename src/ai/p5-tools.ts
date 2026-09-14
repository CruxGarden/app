import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const P5_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_sketch',
    description:
      'Read the running sketch: its name, seed, canvas size, frames drawn, whether it is running or paused. The drawing code itself is sketch.js (read it with read_file).',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_sketch_name',
    description: 'Name the sketch and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_sketch_seed',
    description:
      'Set the seed the sketch runs with (0–999999999); the sketch restarts with it and the seed is saved.',
    input_schema: {
      type: 'object',
      properties: { seed: { type: 'integer', minimum: 0, maximum: 999999999 } },
      required: ['seed'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'restart_sketch',
    description:
      'Restart the sketch from its source (after editing sketch.js, or to draw again with the same seed).',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'pause_sketch',
    description: 'Pause or resume the sketch’s draw loop.',
    input_schema: {
      type: 'object',
      properties: { paused: { type: 'boolean' } },
      required: ['paused'],
      additionalProperties: false,
    },
    writes: [],
  },
  {
    name: 'save_sketch_frame',
    description:
      'Save the canvas as it looks now as a named PNG output of this Crux (exports/), for a site, a notebook or a poster.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
];
export function p5Command(name: string, input: Record<string, unknown>) {
  const only = (keys: string[]) =>
    Object.keys(input).every((k) => keys.includes(k)) && keys.every((k) => k in input);
  if (name === 'inspect_sketch' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'restart_sketch' && !Object.keys(input).length) return { op: 'restart' };
  if (name === 'set_sketch_name') {
    if (
      !only(['name']) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 200
    )
      throw new Error('Name the sketch (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_sketch_seed') {
    if (
      !only(['seed']) ||
      !Number.isInteger(input.seed) ||
      (input.seed as number) < 0 ||
      (input.seed as number) > 999999999
    )
      throw new Error('Give a whole-number seed from 0 to 999999999.');
    return { op: 'set-seed', seed: input.seed };
  }
  if (name === 'pause_sketch') {
    if (!only(['paused']) || typeof input.paused !== 'boolean')
      throw new Error('Say whether to pause (true) or resume (false).');
    return { op: input.paused ? 'pause' : 'resume' };
  }
  if (name === 'save_sketch_frame') {
    if (
      !only(['name']) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 120
    )
      throw new Error('Name the output (up to 120 characters).');
    return { op: 'save-frame', label: input.name.trim() };
  }
  throw new Error(`Unknown sketch tool ${name}.`);
}
