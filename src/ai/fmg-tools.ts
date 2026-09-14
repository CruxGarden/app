import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
/** Fantasy Map Generator App Tools: read the world, name it, make a new one, save a render as an output. */
export const FMG_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_map',
    description:
      'Read the open fantasy map: its name, seed, size in pixels, how many cells, burgs (settlements), states and cultures it has, and how many maps this session has generated.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_map_name',
    description: 'Name the world (the map’s lore name) and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'new_map',
    description:
      'Generate a whole new world with the app’s current generation options (its own New map control) and save it. This replaces the open map; ask before using it on a map a person has edited.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: ['data/project.json'],
    timeoutMs: 3 * 60_000,
  },
  {
    name: 'save_map_image',
    description:
      'Render the whole map as a PNG (default) or SVG and save it as a named output of this Crux (exports/), the way the app’s own export does.',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['png', 'svg'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
    timeoutMs: 5 * 60_000,
  },
];
export function fmgCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (name === 'inspect_map' && !keys.length) return { op: 'inspect' };
  if (name === 'set_map_name') {
    if (
      !only(['name']) ||
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 200
    )
      throw new Error('Name the map (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'new_map') {
    if (keys.length) throw new Error('A new map takes no arguments.');
    return { op: 'new-map' };
  }
  if (name === 'save_map_image') {
    if (
      !only(['format', 'name']) ||
      (input.format !== undefined && !['png', 'svg'].includes(input.format as string)) ||
      (input.name !== undefined &&
        (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120))
    )
      throw new Error('Choose png or svg and an output name up to 120 characters.');
    return {
      op: 'save-image',
      format: input.format ?? 'png',
      ...(typeof input.name === 'string' ? { label: input.name.trim() } : {}),
    };
  }
  throw new Error(`Unknown map tool ${name}.`);
}
