import type { AgentEvent } from './bridge';

export function newCodexState() {
  return {
    text: '',
    previousUsage: null as null | {
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
    },
    hadMutation: false,
    round: 0,
    streamed: new Set<string>(),
    tools: new Map<string, string>(),
    completed: new Set<string>(),
    usage: null as null | { inputTokens: number; outputTokens: number; cachedInputTokens: number },
  };
}
export type CodexState = ReturnType<typeof newCodexState>;

/** App Server item events mapped to Garden's single Collaboration transcript. */
export function mapCodexNotification(method: string, params: any, state: CodexState): AgentEvent[] {
  const out: AgentEvent[] = [];
  if (method === 'item/agentMessage/delta' && typeof params.delta === 'string') {
    state.streamed.add(params.itemId);
    state.text += params.delta;
    return [{ type: 'text', content: params.delta }];
  }
  if (method === 'thread/tokenUsage/updated') {
    const last = params.tokenUsage?.last;
    const total = params.tokenUsage?.total;
    if (last && total) {
      const next = {
        inputTokens: total.inputTokens ?? 0,
        outputTokens: total.outputTokens ?? 0,
        cachedInputTokens: total.cachedInputTokens ?? 0,
      };
      const previous = state.previousUsage;
      const delta = previous
        ? {
            inputTokens: Math.max(0, next.inputTokens - previous.inputTokens),
            outputTokens: Math.max(0, next.outputTokens - previous.outputTokens),
            cachedInputTokens: Math.max(0, next.cachedInputTokens - previous.cachedInputTokens),
          }
        : {
            inputTokens: last.inputTokens ?? 0,
            outputTokens: last.outputTokens ?? 0,
            cachedInputTokens: last.cachedInputTokens ?? 0,
          };
      const accumulated = state.usage ?? { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
      state.usage = {
        inputTokens: accumulated.inputTokens + delta.inputTokens,
        outputTokens: accumulated.outputTokens + delta.outputTokens,
        cachedInputTokens: accumulated.cachedInputTokens + delta.cachedInputTokens,
      };
      state.previousUsage = next;
    }
  }
  if (method === 'error' && !params.willRetry)
    return [{ type: 'error', message: params.error?.message ?? 'Codex reported an error.' }];
  const item = params.item;
  if (!item || !['item/started', 'item/completed'].includes(method)) return out;
  const id = String(item.id);
  if (method === 'item/completed') {
    if (state.completed.has(id)) return out;
    state.completed.add(id);
    if (item.type === 'agentMessage' && !state.streamed.has(id) && item.text) {
      state.text += item.text;
      out.push({ type: 'text', content: item.text });
    }
  }
  const name =
    item.type === 'commandExecution'
      ? 'Bash'
      : item.type === 'fileChange'
        ? 'Edit'
        : item.type === 'mcpToolCall'
          ? `${item.server}/${item.tool}`
          : item.type === 'dynamicToolCall'
            ? item.tool
            : null;
  if (!name) return out;
  const input =
    item.type === 'commandExecution'
      ? { command: item.command, cwd: item.cwd }
      : item.type === 'fileChange'
        ? { changes: item.changes }
        : (item.arguments ?? {});
  if (!state.tools.has(id)) {
    state.tools.set(id, name);
    out.push({ type: 'tool_start', name, id, input });
  }
  if (method === 'item/completed') {
    // Commands can mutate before a failure; partial writes must still reach Growth.
    if (
      item.type === 'commandExecution' ||
      item.type === 'fileChange' ||
      (item.type === 'mcpToolCall' && item.readOnlyHint !== true)
    )
      state.hadMutation = true;
    const error = item.status === 'failed' || item.status === 'declined' || item.success === false;
    const result =
      item.aggregatedOutput ??
      item.result ??
      item.contentItems ??
      item.error ??
      item.changes ??
      item.status;
    out.push({
      type: 'tool_result',
      name,
      id,
      result:
        (error ? 'Error: ' : '') +
        (typeof result === 'string'
          ? result
          : JSON.stringify(result ?? null, (_key, value) =>
              value &&
              typeof value === 'object' &&
              ['image', 'inputImage', 'inputAudio'].includes(value.type)
                ? { type: value.type, media: '[media result]' }
                : value,
            )),
    });
    out.push({ type: 'step_end', index: state.round++ });
  }
  return out;
}
