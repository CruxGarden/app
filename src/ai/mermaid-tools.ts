import type { AppToolDefinition } from '@/services/embedded-app-tool-registry';
export const MERMAID_TOOLS: AppToolDefinition[] = [
  {
    name: 'inspect_mermaid',
    description: 'Read the open Mermaid Live Editor source and configuration.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    writes: [],
  },
  {
    name: 'set_mermaid_source',
    description:
      'Update Mermaid diagram source through the native editor and a confirmed Garden save. The native renderer reports syntax errors.',
    input_schema: {
      type: 'object',
      properties: { code: { type: 'string', maxLength: 1000000 } },
      required: ['code'],
      additionalProperties: false,
    },
    writes: ['data/project.json'],
  },
];
export function mermaidCommand(name: string, input: Record<string, unknown>) {
  if (name === 'inspect_mermaid' && !Object.keys(input).length) return { op: 'inspect' };
  if (
    name !== 'set_mermaid_source' ||
    Object.keys(input).length !== 1 ||
    typeof input.code !== 'string' ||
    input.code.length > 1_000_000
  )
    throw new Error('Choose Mermaid source up to 1 MB.');
  return { op: 'code', code: input.code };
}
