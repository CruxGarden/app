import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const BEEPBOX_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_beepbox',
    description: 'Inspect the open BeepBox song: key, tempo, beats per bar, bar count and channels.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_beepbox_tempo',
    description: 'Set the song tempo in BPM (30 to 320) and save. Never starts playback.',
    input_schema: {
      type: 'object',
      properties: { tempo: { type: 'integer', minimum: 30, maximum: 320 } },
      required: ['tempo'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_beepbox_key',
    description:
      'Set the song key by name (C, C♯, D, D♯, E, F, F♯, G, G♯, A, A♯, B) and save. Never starts playback.',
    input_schema: {
      type: 'object',
      properties: { key: { type: 'string', enum: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] } },
      required: ['key'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
const KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function beepboxCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_beepbox' && !keys.length) return { op: 'inspect' };
  if (name === 'set_beepbox_tempo') {
    const tempo = input.tempo;
    if (keys.length !== 1 || !Number.isInteger(tempo) || (tempo as number) < 30 || (tempo as number) > 320)
      throw new Error('Choose a whole tempo from 30 to 320 BPM.');
    return { op: 'set-tempo', tempo };
  }
  if (name === 'set_beepbox_key') {
    const key = input.key;
    if (keys.length !== 1 || typeof key !== 'string' || !KEYS.includes(key))
      throw new Error(`Choose a key: ${KEYS.join(', ')}.`);
    return { op: 'set-key', key };
  }
  throw new Error('Choose a supported BeepBox operation.');
}
