import { THEME_TOOL_DEFINITIONS, isThemeTool, createThemeToolExecutor } from './theme-tools';
import type { ToolResultContent } from '@/services/types';
/** Shared discovery for garden operations (ADR 0054). Narrow hosts never get these tools. */
import type { ToolDefinition } from './tools';
import { GARDEN_TOOL_DEFINITIONS, runGardenTool, validateGardenTool } from './garden-tools';

export const GARDEN_HOST_ID = '@garden';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const GARDEN_ACCESS_TOOLS: ToolDefinition[] = [
  {
    name: 'list_garden_tools',
    description:
      'Discover garden-wide operating tools and their input schemas: create Cruxes and Cruxspaces, navigate panes, run collaborators, change Moods, search, export, or work in another Crux. Call this before call_garden_tool.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'call_garden_tool',
    description:
      'Run a garden-wide operating tool discovered with list_garden_tools. Actions are visible in the app; existing human approvals still apply.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        input: { type: 'object', additionalProperties: true },
      },
      required: ['name', 'input'],
      additionalProperties: false,
    },
  },
];
export const isGardenAccessTool = (name: string) =>
  GARDEN_ACCESS_TOOLS.some((t) => t.name === name);

const CRUX_ACCESS_TOOLS: ToolDefinition[] = [
  {
    name: 'list_crux_tools',
    description:
      'Open a Crux and discover its creative tools and schemas. Uses its actual template and installed tools.',
    input_schema: {
      type: 'object',
      properties: { cruxId: { type: 'string' } },
      required: ['cruxId'],
      additionalProperties: false,
    },
  },
  {
    name: 'call_crux_tool',
    description:
      'Use a tool in a named Crux. Discover its schema with list_crux_tools first. The call is recorded in that Crux’s Collaboration and follows its normal approvals and Growth policy.',
    input_schema: {
      type: 'object',
      properties: {
        cruxId: { type: 'string' },
        name: { type: 'string' },
        input: { type: 'object', additionalProperties: true },
      },
      required: ['cruxId', 'name', 'input'],
      additionalProperties: false,
    },
  },
];
export function gardenOperatingTools(): ToolDefinition[] {
  // An agent cannot answer the person's approval on its own behalf.
  return [
    ...GARDEN_TOOL_DEFINITIONS.filter((t) => t.name !== 'answer_approval'),
    ...THEME_TOOL_DEFINITIONS,
    ...CRUX_ACCESS_TOOLS,
  ];
}
export function validateGardenAccess(name: string, input: Record<string, unknown>) {
  if (name === 'list_garden_tools') return { valid: true };
  if (name !== 'call_garden_tool' || typeof input.name !== 'string' || !object(input.input))
    return { valid: false, error: 'name and an input object are required' };
  return validateGardenOperation(input.name, input.input);
}
export function validateGardenOperation(name: string, input: Record<string, unknown>) {
  if (!gardenOperatingTools().some((t) => t.name === name))
    return { valid: false, error: `Unknown garden tool: ${name}` };
  if (name === 'list_crux_tools' || name === 'call_crux_tool') {
    if (typeof input.cruxId !== 'string' || !input.cruxId.trim() || input.cruxId === GARDEN_HOST_ID)
      return { valid: false, error: 'A Crux id is required' };
    if (
      name === 'call_crux_tool' &&
      (typeof input.name !== 'string' || !object(input.input) || isGardenAccessTool(input.name))
    )
      return { valid: false, error: 'A Crux tool name and input object are required' };
    return { valid: true };
  }
  if (isThemeTool(name)) return { valid: true };
  return validateGardenTool(name, input);
}
export async function runGardenAccess(
  name: string,
  input: Record<string, unknown>,
  actor: string,
  currentCrux?: string,
): Promise<ToolResultContent> {
  const valid = validateGardenAccess(name, input);
  if (!valid.valid) return `Error: ${valid.error}`;
  if (name === 'list_garden_tools') return JSON.stringify(gardenOperatingTools());
  return runGardenOperation(
    input.name as string,
    input.input as Record<string, unknown>,
    actor,
    currentCrux,
  );
}
export async function runGardenOperation(
  name: string,
  input: Record<string, unknown>,
  actor: string,
  currentCrux?: string,
): Promise<ToolResultContent> {
  const valid = validateGardenOperation(name, input);
  if (!valid.valid) return `Error: ${valid.error}`;
  if (name === 'run_turn' && input.cruxId === currentCrux)
    return 'Error: You are already working in this Crux. Use its tools directly instead of starting another turn in it.';
  if (isThemeTool(name)) return createThemeToolExecutor()(name, input);
  const { executeGardenCruxTool, listGardenCruxTools } = await import('@/services/agent-host');
  if (name === 'list_crux_tools')
    return JSON.stringify(await listGardenCruxTools(input.cruxId as string));
  if (name === 'call_crux_tool' || name === 'publish_crux') {
    const result = await executeGardenCruxTool(
      input.cruxId as string,
      actor,
      name === 'publish_crux' ? 'publish' : (input.name as string),
      name === 'publish_crux' ? {} : (input.input as Record<string, unknown>),
    );
    if (result.isError)
      return (
        'Error: ' +
        result.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
      );
    if (result.content.every((b) => b.type === 'text'))
      return result.content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
    return result.content.map((b) =>
      b.type === 'text'
        ? b
        : {
            type: 'image' as const,
            source: { type: 'base64' as const, data: b.data, media_type: b.mimeType },
          },
    );
  }
  return runGardenTool(name, input, actor.startsWith('agent:') ? actor : `agent:${actor}`);
}
