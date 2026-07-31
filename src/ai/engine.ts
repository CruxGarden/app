import type { ProviderAdapter } from './adapters/types';
import type { NormalizedMessage, ContentBlock, ToolResultContent } from '@/services/types';
import { TOOL_DEFINITIONS, MUTATING_TOOLS } from './tools';
import {
  buildSystemPrompt,
  estimateTokens,
  trimMessagesIfNeeded,
} from './system-prompt';

/** Events yielded by the conversation engine */
export type ConversationEvent =
  | { type: 'text'; content: string }
  | {
      type: 'tool_start';
      name: string;
      id: string;
      input: Record<string, unknown>;
    }
  | { type: 'tool_result'; name: string; id: string; result: string }
  | { type: 'done'; textContent: string; hadMutation: boolean }
  | { type: 'error'; message: string }
  | { type: 'info'; message: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

const MAX_ROUNDS = 10;

/** Optional overrides — used by callers that aren't the crux workspace (e.g. the Keeper Console). */
export interface ConversationOptions {
  /** Use this system prompt verbatim instead of building the crux workspace prompt. */
  systemPrompt?: string;
  /** Tool set to offer the model. Pass [] for a plain chat with no tools. */
  tools?: typeof TOOL_DEFINITIONS;
}

/**
 * Run the AI conversation loop.
 *
 * Mirrors api/src/ai/ai.service.ts's runConversationLoop.
 * Yields events matching the current SSE event types so the useChat
 * hook can consume them identically.
 *
 * @param adapter - Provider adapter (Anthropic, OpenAI, etc.)
 * @param apiKey - User's API key for the provider
 * @param cruxId - The crux being worked on (for system prompt + tools)
 * @param messages - Conversation history
 * @param model - Model ID to use
 * @param executeToolFn - Tool executor (bound to cruxId via createToolExecutor); omit for tool-less chats
 * @param signal - AbortSignal for cancellation
 * @param options - System prompt / tool overrides for non-workspace callers
 */
export async function* runConversation(
  adapter: ProviderAdapter,
  apiKey: string,
  cruxId: string,
  messages: NormalizedMessage[],
  model: string,
  executeToolFn?: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<string | ToolResultContent>,
  signal?: AbortSignal,
  options?: ConversationOptions,
): AsyncGenerator<ConversationEvent> {
  const tools = options?.tools ?? TOOL_DEFINITIONS;
  let systemPrompt = options?.systemPrompt ?? (await buildSystemPrompt(cruxId));
  let currentMessages = [...messages];
  let fullTextContent = '';
  let hadMutation = false;

  // Trim messages if needed to fit context window
  const systemTokens = estimateTokens(systemPrompt);
  const { messages: trimmedMessages, trimmed } = trimMessagesIfNeeded(
    currentMessages as { role: string; content: unknown }[],
    systemTokens,
  );
  if (trimmed) {
    currentMessages = trimmedMessages as NormalizedMessage[];
    yield {
      type: 'info',
      message: 'Older messages were trimmed to fit the context window.',
    };
  }

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Stream the response
    let response;
    try {
      response = await adapter.stream({
        apiKey,
        systemPrompt,
        messages: currentMessages,
        model,
        tools,
        onText: (_text) => {
          // We can't yield from inside a callback, so text is accumulated
          // in the StreamResponse and yielded after
        },
        signal,
      });
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === 'AbortError') return;

      // Anthropic rate limit or overload that survived SDK retries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- HTTP error status
      const status = (e as any).status;
      if (status === 429 || status === 529) {
        yield {
          type: 'error',
          message:
            'The AI service is temporarily overloaded. Please try again in a moment.',
        };
        return;
      }

      yield { type: 'error', message: e.message };
      return;
    }

    // Detect max_tokens truncation with no usable content
    if (
      response.stopReason === 'max_tokens' &&
      response.toolCalls.length === 0 &&
      !response.textContent
    ) {
      yield {
        type: 'error',
        message:
          'Response was truncated (max_tokens reached with no usable content). The file may be too large for a single operation.',
      };
      return;
    }

    // Yield usage from this round
    if (response.usage) {
      yield {
        type: 'usage',
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      };
    }

    // Yield the text content
    if (response.textContent) {
      fullTextContent += response.textContent;
      yield { type: 'text', content: response.textContent };
    }

    // If no tool use (or no executor to run tools), we're done
    if (
      response.stopReason !== 'tool_use' ||
      response.toolCalls.length === 0 ||
      !executeToolFn
    ) {
      yield {
        type: 'done',
        textContent: fullTextContent,
        hadMutation,
      };
      return;
    }

    // Process tool calls — parallel across independent path groups,
    // sequential within same-path groups (mirrors API's groupToolCallsByPath)
    const groups = groupToolCallsByPath(response.toolCalls);

    // Execute each group as a sequential chain, all groups in parallel
    const groupResults = await Promise.all(
      [...groups.values()].map(async (chain) => {
        const events: ConversationEvent[] = [];
        const results: { toolId: string; content: string | ToolResultContent; name: string }[] = [];
        let chainHadMutation = false;

        for (const toolUse of chain) {
          events.push({
            type: 'tool_start',
            name: toolUse.name,
            id: toolUse.id,
            input: toolUse.input,
          });

          const result = await executeToolFn(toolUse.name, toolUse.input);

          const displayResult = typeof result === 'string'
            ? result
            : result.filter((b) => b.type === 'text').map((b) => 'text' in b ? b.text : '').join('\n');
          events.push({
            type: 'tool_result',
            name: toolUse.name,
            id: toolUse.id,
            result: displayResult,
          });

          results.push({ toolId: toolUse.id, content: result, name: toolUse.name });

          if (MUTATING_TOOLS.includes(toolUse.name)) {
            chainHadMutation = true;
          }
        }

        return { events, results, chainHadMutation };
      }),
    );

    // Yield events in original tool call order and aggregate results
    const resultMap = new Map<string, string | ToolResultContent>();
    let roundHadMutation = false;
    for (const gr of groupResults) {
      if (gr.chainHadMutation) {
        roundHadMutation = true;
        hadMutation = true;
      }
      for (const r of gr.results) resultMap.set(r.toolId, r.content);
    }

    // Yield events in original tool call order for consistent UI
    for (const toolUse of response.toolCalls) {
      yield {
        type: 'tool_start',
        name: toolUse.name,
        id: toolUse.id,
        input: toolUse.input,
      };
      const rawResult = resultMap.get(toolUse.id) || 'Error: no result';
      // Yield string version for UI display
      const displayResult = typeof rawResult === 'string'
        ? rawResult
        : rawResult.filter((b) => b.type === 'text').map((b) => 'text' in b ? b.text : '').join('\n');
      yield {
        type: 'tool_result',
        name: toolUse.name,
        id: toolUse.id,
        result: displayResult,
      };
    }

    // Pass rich content (including images) to the API for the next round
    const toolResults: ContentBlock[] = response.toolCalls.map((tc) => ({
      type: 'tool_result',
      tool_use_id: tc.id,
      content: resultMap.get(tc.id) || 'Error: no result',
    }));

    // Refresh system prompt after mutations so AI sees updated file listing
    // (workspace prompt only — custom prompts have no file listing to refresh)
    if (roundHadMutation && !options?.systemPrompt) {
      systemPrompt = await buildSystemPrompt(cruxId);
    }

    // Re-trim after adding tool results if conversation is growing
    const newSystemTokens = estimateTokens(systemPrompt);
    const updatedMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content: response.fullContent },
      { role: 'user' as const, content: toolResults },
    ];
    const retrim = trimMessagesIfNeeded(
      updatedMessages as { role: string; content: unknown }[],
      newSystemTokens,
    );
    currentMessages = retrim.messages as NormalizedMessage[];
  }

  // Ran out of rounds
  yield {
    type: 'done',
    textContent: fullTextContent,
    hadMutation,
  };
}

/**
 * Group tool calls by file path so same-path operations stay sequential
 * while different-path operations can run in parallel.
 * Ported from api/src/ai/ai.service.ts groupToolCallsByPath.
 */
function groupToolCallsByPath(
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[],
): Map<string, { id: string; name: string; input: Record<string, unknown> }[]> {
  const groups = new Map<
    string,
    { id: string; name: string; input: Record<string, unknown> }[]
  >();

  for (const tc of toolCalls) {
    const path = tc.input?.path as string | undefined;
    // Tools without a path (list_files) get their own independent group
    const key = path ? path.replace(/^\//, '') : `__no_path_${tc.id}`;
    const group = groups.get(key) || [];
    group.push(tc);
    groups.set(key, group);
  }

  return groups;
}
