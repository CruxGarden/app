import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
/** Signal (MIDI sequencer) App Tools: read the song, name it, write notes into a track, save MIDI or a WAV render as an output. */
export const SIGNAL_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_song',
    description:
      'Read the open song: its name, tempo, time signature, ticks per quarter note (timebase), length in ticks and measures, and its tracks (number, name, channel, program, note count, whether it is the rhythm track).',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_song_name',
    description: 'Name the song and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
      required: ['name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'set_track_notes',
    description:
      'Write notes into a track (replacing its notes unless replace is false) and save. track is 1-based; one past the last track makes a new track on the next free channel (rhythm: true puts it on the drum channel). Ticks count 480 per quarter note by default (inspect_song reports the timebase); noteNumber 60 is middle C. Optionally name the track, set its program (General MIDI instrument 0–127) and the song tempo.',
    input_schema: {
      type: 'object',
      properties: {
        track: { type: 'integer', minimum: 1, maximum: 64 },
        notes: {
          type: 'array',
          maxItems: 4000,
          items: {
            type: 'object',
            properties: {
              tick: { type: 'integer', minimum: 0 },
              duration: { type: 'integer', minimum: 1 },
              noteNumber: { type: 'integer', minimum: 0, maximum: 127 },
              velocity: { type: 'integer', minimum: 1, maximum: 127 },
            },
            required: ['tick', 'duration', 'noteNumber'],
            additionalProperties: false,
          },
        },
        name: { type: 'string', minLength: 1, maxLength: 120 },
        program: { type: 'integer', minimum: 0, maximum: 127 },
        tempo: { type: 'number', minimum: 20, maximum: 400 },
        rhythm: { type: 'boolean' },
        replace: { type: 'boolean' },
      },
      required: ['track', 'notes'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
    timeoutMs: 2 * 60_000,
  },
  {
    name: 'save_song_midi',
    description: 'Save the song as a Standard MIDI File output of this Crux (exports/).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
  },
  {
    name: 'save_song_audio',
    description:
      'Render the song with its instrument sounds to a WAV file and save it as a named output of this Crux (exports/). Takes a while for long songs.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', minLength: 1, maxLength: 120 } },
      required: [],
      additionalProperties: false,
    },
    writes: ['data/project.json', 'exports/'],
    timeoutMs: 10 * 60_000,
  },
];
const isName = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
export function signalCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  const only = (allowed: string[]) => keys.every((k) => allowed.includes(k));
  if (name === 'inspect_song' && !keys.length) return { op: 'inspect' };
  if (name === 'set_song_name') {
    if (!only(['name']) || !isName(input.name, 200)) throw new Error('Name the song (up to 200 characters).');
    return { op: 'set-name', name: (input.name as string).trim() };
  }
  if (name === 'set_track_notes') {
    if (
      !only(['track', 'notes', 'name', 'program', 'tempo', 'rhythm', 'replace']) ||
      !Number.isInteger(input.track) ||
      (input.track as number) < 1 ||
      !Array.isArray(input.notes) ||
      input.notes.length > 4000 ||
      (input.name !== undefined && !isName(input.name, 120)) ||
      (input.program !== undefined &&
        (!Number.isInteger(input.program) || (input.program as number) < 0 || (input.program as number) > 127)) ||
      (input.tempo !== undefined &&
        (typeof input.tempo !== 'number' || input.tempo < 20 || input.tempo > 400)) ||
      (input.rhythm !== undefined && typeof input.rhythm !== 'boolean') ||
      (input.replace !== undefined && typeof input.replace !== 'boolean')
    )
      throw new Error('Give a track number, a list of notes and optional name, program, tempo, rhythm, replace.');
    for (const n of input.notes as unknown[]) {
      const note = n as Record<string, unknown>;
      if (
        !note ||
        typeof note !== 'object' ||
        !Number.isInteger(note.tick) ||
        (note.tick as number) < 0 ||
        !Number.isInteger(note.duration) ||
        (note.duration as number) < 1 ||
        !Number.isInteger(note.noteNumber) ||
        (note.noteNumber as number) < 0 ||
        (note.noteNumber as number) > 127 ||
        (note.velocity !== undefined &&
          (!Number.isInteger(note.velocity) || (note.velocity as number) < 1 || (note.velocity as number) > 127)) ||
        Object.keys(note).some((k) => !['tick', 'duration', 'noteNumber', 'velocity'].includes(k))
      )
        throw new Error('Each note is {tick, duration, noteNumber, velocity?} with integer values.');
    }
    return { op: 'set-notes', ...input };
  }
  if (name === 'save_song_midi' || name === 'save_song_audio') {
    if (!only(['name']) || (input.name !== undefined && !isName(input.name, 120)))
      throw new Error('Choose an output name up to 120 characters.');
    return {
      op: 'save-output',
      format: name === 'save_song_audio' ? 'wav' : 'midi',
      ...(typeof input.name === 'string' ? { label: input.name.trim() } : {}),
    };
  }
  throw new Error(`Unknown song tool ${name}.`);
}
