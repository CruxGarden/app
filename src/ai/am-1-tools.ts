import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const AM1_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_am1',
    description:
      'Inspect the AM-1 session: the patch name, key, scale, tempo, circuit (mk1/mk2), whether it is running, the three parts, the saved patches and the kept files.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_am1_tempo',
    description:
      'Set the tempo (5 to 180) of the live patch and save the session. Never presses RUN.',
    input_schema: {
      type: 'object',
      properties: { tempo: { type: 'integer', minimum: 5, maximum: 180 } },
      required: ['tempo'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_am1_key',
    description:
      'Set the key (C, C#, D … B) and optionally the scale (as the instrument names them, for example minor, major, dorian, lydian, free) of the live patch and save the session.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', enum: KEYS },
        scale: { type: 'string', minLength: 1, maxLength: 40 },
      },
      required: ['key'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function am1Command(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_am1' && !keys.length) return { op: 'inspect' };
  if (name === 'set_am1_tempo') {
    const tempo = input.tempo;
    if (
      keys.length !== 1 ||
      !Number.isInteger(tempo) ||
      (tempo as number) < 5 ||
      (tempo as number) > 180
    )
      throw new Error('Choose a whole tempo from 5 to 180.');
    return { op: 'set-tempo', tempo };
  }
  if (name === 'set_am1_key') {
    const { key, scale } = input;
    if (
      keys.some((k) => !['key', 'scale'].includes(k)) ||
      typeof key !== 'string' ||
      !KEYS.includes(key) ||
      (scale !== undefined && (typeof scale !== 'string' || !scale.trim() || scale.length > 40))
    )
      throw new Error('Choose a key from C to B and, optionally, a scale the instrument names.');
    return { op: 'set-key', key, ...(scale === undefined ? {} : { scale: scale.trim() }) };
  }
  throw new Error('Choose a supported AM-1 operation.');
}
