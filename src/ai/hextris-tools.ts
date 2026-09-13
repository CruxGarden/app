import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const HEXTRIS_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_hextris',
    description: 'Inspect the open Hextris game: state, current score, high scores and whether a saved game exists.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'reset_hextris_progress',
    description: 'Clear the saved game and high scores and save; the game starts clean on its next reload.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: ['data/project.json'],
  },
];
export function hextrisCommand(name: string, input: Record<string, unknown>) {
  if (Object.keys(input).length) throw new Error('These Hextris operations take no input.');
  if (name === 'inspect_hextris') return { op: 'inspect' };
  if (name === 'reset_hextris_progress') return { op: 'reset' };
  throw new Error('Choose a supported Hextris operation.');
}
