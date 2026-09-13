import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const WEB_SYNTH_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_web_synth',
    description:
      'Inspect the open web-synth composition: its modules (view contexts with ids, kinds and titles), the patch connections between them and the global tempo.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_web_synth_tempo',
    description: 'Set the global tempo of the composition in BPM (20 to 400) and save.',
    input_schema: {
      type: 'object',
      properties: { bpm: { type: 'number', minimum: 20, maximum: 400 } },
      required: ['bpm'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'add_web_synth_module',
    description:
      'Add a module (view context) to the composition by kind, for example synth_designer, midi_editor, sequencer, sampler, looper, granulator, graph_editor, control_panel, filter_designer, equalizer, signal_analyzer, midi_keyboard. Optional title. Saves the composition. Never starts audio.',
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', pattern: '^[a-z_]{2,40}$' },
        title: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
  {
    name: 'rename_web_synth_module',
    description: 'Rename a module by its id (inspect first) and save.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f-]{36}$' },
        title: { type: 'string', minLength: 1, maxLength: 120 },
      },
      required: ['id', 'title'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function webSynthCommand(name: string, input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (name === 'inspect_web_synth' && !keys.length) return { op: 'inspect' };
  if (name === 'set_web_synth_tempo') {
    const bpm = input.bpm;
    if (keys.length !== 1 || typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 20 || bpm > 400)
      throw new Error('Choose a tempo from 20 to 400 BPM.');
    return { op: 'set-tempo', bpm };
  }
  if (name === 'add_web_synth_module') {
    const { kind, title } = input;
    if (
      keys.some((k) => !['kind', 'title'].includes(k)) ||
      typeof kind !== 'string' ||
      !/^[a-z_]{2,40}$/.test(kind) ||
      (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 120))
    )
      throw new Error('Choose a module kind and an optional title up to 120 characters.');
    return { op: 'add-module', kind, ...(title !== undefined ? { title: title.trim() } : {}) };
  }
  if (name === 'rename_web_synth_module') {
    const { id, title } = input;
    if (
      keys.some((k) => !['id', 'title'].includes(k)) ||
      typeof id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(id) ||
      typeof title !== 'string' ||
      !title.trim() ||
      title.length > 120
    )
      throw new Error('Inspect web-synth and choose a module id and title.');
    return { op: 'rename-module', id, title: title.trim() };
  }
  throw new Error('Choose a supported web-synth operation.');
}
