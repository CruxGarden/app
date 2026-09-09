/**
 * Agent Provider (ADR 0019): the Claude Agent SDK's message stream mapped onto
 * the Collaboration engine's event shape, so a Claude Code turn renders in the
 * pane exactly like a built-in collaborator turn — text deltas, tool bubbles,
 * results, a step boundary per model round, usage, done.
 *
 * Pure: no IPC, no SDK import. `AgentEvent` is the renderer's ConversationEvent
 * plus two agent-only members (`session`, `result`) the renderer consumes itself.
 */

export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; id: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; id: string; result: string }
  | { type: 'step_end'; index: number }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string }
  | { type: 'done'; textContent: string; hadMutation: boolean }
  /** The SDK session this turn runs in — kept per crux so the next turn resumes it. */
  | { type: 'session'; sessionId: string; model: string; version: string }
  /** The turn's bill, from the SDK's result message. */
  | { type: 'result'; costUsd: number; durationMs: number; numTurns: number; isError: boolean };

/** Claude Code tools whose success means files in the Project Folder changed. */
export const AGENT_MUTATING_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'];

export interface MapperState {
  toolNames: Map<string, string>;
  round: number;
  /** Characters of the current assistant message already delivered as deltas. */
  streamedChars: number;
  text: string;
  hadMutation: boolean;
}

export function newMapperState(): MapperState {
  return { toolNames: new Map(), round: 0, streamedChars: 0, text: '', hadMutation: false };
}

type Block = { type: string; [k: string]: unknown };

function blocksOf(message: unknown): Block[] {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? (content as Block[]) : [];
}

/** A tool_result's content as the one string the pane shows. */
export function toolResultText(block: Block): string {
  const c = block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((part) => {
        const p = part as Block;
        if (p.type === 'text') return String(p.text ?? '');
        if (p.type === 'image') return '[image]';
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

/**
 * Map one SDK message to zero or more events. Sub-agent traffic
 * (`parent_tool_use_id` set) is skipped: the Task tool's own result carries it.
 */
export function mapSdkMessage(msg: unknown, state: MapperState): AgentEvent[] {
  const m = msg as Record<string, unknown>;
  const out: AgentEvent[] = [];
  if (!m || typeof m.type !== 'string') return out;
  if (m.parent_tool_use_id) return out;

  switch (m.type) {
    case 'system': {
      if (m.subtype === 'init') {
        out.push({
          type: 'session',
          sessionId: String(m.session_id ?? ''),
          model: String(m.model ?? ''),
          version: String(m.claude_code_version ?? ''),
        });
      }
      break;
    }
    case 'stream_event': {
      const ev = m.event as Record<string, unknown> | undefined;
      if (!ev) break;
      if (ev.type === 'message_start') state.streamedChars = 0;
      if (ev.type === 'content_block_delta') {
        const delta = ev.delta as Record<string, unknown> | undefined;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text) {
          state.streamedChars += delta.text.length;
          state.text += delta.text;
          out.push({ type: 'text', content: delta.text });
        }
      }
      break;
    }
    case 'assistant': {
      for (const block of blocksOf(m.message)) {
        if (block.type === 'text' && typeof block.text === 'string') {
          // Streamed already? Then the complete message repeats what the deltas said.
          if (state.streamedChars === 0 && block.text) {
            state.text += block.text;
            out.push({ type: 'text', content: block.text });
          }
        } else if (block.type === 'tool_use') {
          const id = String(block.id ?? '');
          const name = String(block.name ?? 'tool');
          state.toolNames.set(id, name);
          out.push({
            type: 'tool_start',
            id,
            name,
            input: (block.input as Record<string, unknown>) ?? {},
          });
        }
      }
      state.streamedChars = 0;
      break;
    }
    case 'user': {
      let sawResult = false;
      for (const block of blocksOf(m.message)) {
        if (block.type !== 'tool_result') continue;
        sawResult = true;
        const id = String(block.tool_use_id ?? '');
        const name = state.toolNames.get(id) ?? 'tool';
        const result = toolResultText(block);
        const isError = block.is_error === true;
        if (!isError && AGENT_MUTATING_TOOLS.includes(name)) state.hadMutation = true;
        out.push({ type: 'tool_result', id, name, result: isError ? `Error: ${result}` : result });
      }
      if (sawResult) out.push({ type: 'step_end', index: state.round++ });
      break;
    }
    case 'result': {
      const usage = (m.usage as Record<string, number> | undefined) ?? {};
      out.push({
        type: 'usage',
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cachedInputTokens: usage.cache_read_input_tokens ?? 0,
      });
      const isError = m.is_error === true || m.subtype !== 'success';
      if (isError) {
        const detail =
          typeof m.result === 'string' && m.result
            ? m.result
            : Array.isArray(m.errors) && m.errors.length
              ? String(m.errors[0])
              : String(m.subtype ?? 'the turn failed');
        out.push({ type: 'error', message: detail });
      }
      out.push({
        type: 'result',
        costUsd: Number(m.total_cost_usd ?? 0),
        durationMs: Number(m.duration_ms ?? 0),
        numTurns: Number(m.num_turns ?? 0),
        isError,
      });
      out.push({ type: 'done', textContent: state.text, hadMutation: state.hadMutation });
      break;
    }
    default:
      break;
  }
  return out;
}

/** One line that says what a tool wants to do — for the permission banner. */
export function describeToolUse(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return String(input.command ?? '').slice(0, 200);
    case 'WebFetch':
      return String(input.url ?? '');
    case 'WebSearch':
      return String(input.query ?? '');
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return String(input.file_path ?? input.notebook_path ?? '');
    case 'Glob':
    case 'Grep':
      return String(input.pattern ?? '');
    case 'Task':
      return String(input.description ?? '');
    default: {
      const s = JSON.stringify(input);
      return s.length > 200 ? `${s.slice(0, 200)}…` : s;
    }
  }
}
