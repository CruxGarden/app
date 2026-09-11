import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const KETCHER_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_ketcher',
    description: 'Read native molecule, atom and bond counts, reaction status and SMILES.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_ketcher_structure',
    description:
      'Replace the native chemistry drawing with SMILES, MOL or KET input and save it in Garden.',
    input_schema: {
      type: 'object',
      properties: { structure: { type: 'string', minLength: 1, maxLength: 100000 } },
      required: ['structure'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function ketcherCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_ketcher' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'set_ketcher_structure' ||
    Object.keys(input).length !== 1 ||
    typeof input.structure !== 'string' ||
    !input.structure.trim() ||
    input.structure.length > 100000
  )
    throw new Error('Choose a structure up to 100,000 characters.');
  return { op: 'set-structure', structure: input.structure };
}
