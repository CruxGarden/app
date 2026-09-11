import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const AUDIOMASS_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_audiomass',
    description: 'Inspect the open AudioMass waveform and native multitrack tracks and clips.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'rename_audiomass_track',
    description:
      'Rename a native AudioMass track through undo and a confirmed Garden save. Inspect for track IDs first.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string', maxLength: 200 } },
      required: ['id', 'name'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function audiomassCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_audiomass' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'rename_audiomass_track' ||
    typeof input.id !== 'string' ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 200 ||
    Object.keys(input).some((k) => !['id', 'name'].includes(k))
  )
    throw new Error('Inspect AudioMass and choose a track ID and name.');
  return { op: 'rename-track', ...input };
}
