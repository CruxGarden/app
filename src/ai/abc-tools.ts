import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
/** Notation (abcjs) App Tools: read the score, name it, replace its ABC, save a render as an output. */
export const ABC_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_score',
    description:
      'Read the open score: its name, the number of tunes, the first tune’s title, composer, key, meter and tempo, how many warnings the ABC has, and the ABC text itself (first 4 000 characters). Read data/project.json for the whole text.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_score_name',
    description: 'Name the score and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_score_abc',
    description:
      'Replace the whole score with new ABC notation (an X: header, T: title, M: meter, L: unit length, K: key, then the tune); the page re-renders and re-tunes playback, and the score is saved.',
    input_schema: {
      type: 'object',
      properties: { abc: { type: 'string', minLength: 1, maxLength: 200000 } },
      required: ['abc'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'save_score_image',
    description:
      'Render the score as it looks now as an SVG (default) or PNG and save it as a named output of this Crux (exports/).',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['svg', 'png'] },
        name: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
];
export function abcCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (name === 'inspect_score' && !keys.length) return { op: 'inspect' };
  if (name === 'set_score_name') {
    if (!only(['name']) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200)
      throw new Error('Name the score (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  if (name === 'set_score_abc') {
    if (!only(['abc']) || typeof input.abc !== 'string' || !input.abc.trim() || input.abc.length > 200000)
      throw new Error('Give the whole ABC text (up to 200 000 characters).');
    if (!/^\s*X:/m.test(input.abc)) throw new Error('ABC text needs an X: header line.');
    return { op: 'set-abc', abc: input.abc };
  }
  if (name === 'save_score_image') {
    if (
      !only(['format', 'name']) ||
      (input.format !== undefined && !['svg', 'png'].includes(input.format as string)) ||
      (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120))
    )
      throw new Error('Choose svg or png and an output name up to 120 characters.');
    return { op: 'save-image', format: input.format ?? 'svg', ...(typeof input.name === 'string' ? { label: input.name.trim() } : {}) };
  }
  throw new Error(`Unknown notation tool ${name}.`);
}
