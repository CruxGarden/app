import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const RECORDER_TOOLS: AppToolDefinition[] = [
  { name: 'inspect_recordings', description: 'List the recordings kept in this Crux (label, path, type, size, when) and the Crux’s name. Recording itself starts and stops by hand.', input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false }, writes: [] },
  { name: 'set_recorder_name', description: 'Name this recordings Crux and save it in Garden.', input_schema: { type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 200 } }, required: ['name'], additionalProperties: false }, writes: ['data/project.json'] },
];
export function recorderCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_recordings' && !Object.keys(input).length) return { op: 'inspect' };
  if (name === 'set_recorder_name') {
    if (Object.keys(input).length !== 1 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) throw new Error('Name the Crux (up to 200 characters).');
    return { op: 'set-name', name: input.name.trim() };
  }
  throw new Error(`Unknown recorder tool ${name}.`);
}
