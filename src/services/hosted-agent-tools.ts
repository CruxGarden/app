import type { AgentToolRequest, AgentToolResult } from '../../electron/src/bridge';
import { createToolExecutor, defaultToolDefinitions, didMutate } from '@/ai/tools';
import { getWorkspace } from '@/stores/workspaceRegistry';

/** Hosted turns own their transcript and checkpoint. This route never invokes the external MCP recorder. */
export function createHostedAgentTools(cruxId: string, provider: string, signal: AbortSignal) {
  const workspace = getWorkspace(cruxId);
  const active = () =>
    !!workspace &&
    getWorkspace(cruxId) === workspace &&
    workspace.phase === 'ready' &&
    !signal.aborted;
  const execute = createToolExecutor(
    cruxId,
    async (path, artifactId) => {
      if (!active()) return false;
      const cancel = () => workspace!.data.getState().dismissDelete(artifactId);
      signal.addEventListener('abort', cancel, { once: true });
      try {
        return await workspace!.data.getState().requestDeleteApproval(artifactId, path);
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    provider,
    { requestedBy: `agent:${provider}`, signal },
  );
  const discovered = new Set<string>();
  let queue: Promise<unknown> = Promise.resolve();
  const error = (text: string): AgentToolResult => ({
    isError: true,
    content: [{ type: 'text', text: `Error: ${text}` }],
  });
  async function run(request: AgentToolRequest): Promise<AgentToolResult> {
    if (!active() || request.cruxId !== cruxId)
      return error('The originating Working Copy or turn is no longer active.');
    const definitions = defaultToolDefinitions(cruxId).filter((tool) => tool.name !== 'delegate');
    if (request.name === 'garden_search_tools') {
      const query =
        typeof request.input.query === 'string'
          ? request.input.query.trim().toLowerCase().slice(0, 200)
          : '';
      const offset =
        Number.isSafeInteger(request.input.offset) && Number(request.input.offset) >= 0
          ? Number(request.input.offset)
          : 0;
      const matches = definitions.filter(
        (tool) => !query || `${tool.name} ${tool.description}`.toLowerCase().includes(query),
      );
      const page = matches.slice(offset, offset + 12);
      for (const tool of page) discovered.add(tool.name);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              tools: page,
              total: matches.length,
              nextOffset: offset + page.length < matches.length ? offset + page.length : null,
            }),
          },
        ],
      };
    }
    if (request.name !== 'garden_call_tool') return error('Unknown Garden connection tool.');
    const { name, input } = request.input;
    if (
      typeof name !== 'string' ||
      !discovered.has(name) ||
      !definitions.some((tool) => tool.name === name)
    )
      return error(
        'Discover this tool with garden_search_tools first. Only currently available tools can run.',
      );
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return error('Tool input must be an object.');
    const result = await execute(name, input as Record<string, unknown>);
    const hadMutation = didMutate(name, result);
    if (hadMutation && active()) await workspace!.data.getState().refreshArtifacts();
    return {
      content:
        typeof result === 'string'
          ? [{ type: 'text', text: result }]
          : result.map((part) =>
              part.type === 'text'
                ? { type: 'text', text: part.text }
                : { type: 'image', data: part.source.data, mimeType: part.source.media_type },
            ),
      isError: typeof result === 'string' && result.startsWith('Error'),
      hadMutation,
    };
  }
  return (request: AgentToolRequest): Promise<AgentToolResult> => {
    const operation = queue.then(() => run(request));
    queue = operation.catch(() => {});
    workspace?.operations.add(operation);
    return operation.finally(() => workspace?.operations.delete(operation));
  };
}
