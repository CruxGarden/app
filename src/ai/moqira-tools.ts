import {
  moqiraDefinitions,
  validateMoqiraCommand,
} from '../../moqira-crux/src/garden/commands-schema';
import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';

export const MOQIRA_TOOLS: readonly AppToolDefinition[] = moqiraDefinitions.map(
  ({ op, name, description, input_schema }) => ({
    name,
    description,
    input_schema: input_schema as AppToolDefinition['input_schema'],
    writes: ['inspect', 'catalogue', 'read-wireframe', 'read-component'].includes(op)
      ? []
      : op === 'save-project'
        ? ['outputs/*']
        : ['mockups/project.json'],
  }),
);
export function moqiraCommand(name: string, input: Record<string, unknown>) {
  const definition = moqiraDefinitions.find((tool) => tool.name === name);
  if (!definition || Object.prototype.hasOwnProperty.call(input, 'op'))
    throw Error('Choose a supported Moqira tool.');
  return validateMoqiraCommand({ ...input, op: definition.op });
}
