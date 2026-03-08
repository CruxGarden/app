import type { ProviderAdapter } from './adapters/types';
import type { NormalizedMessage, ContentBlock } from '@/services/types';
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
  | { type: 'error'; message: string };

const MAX_ROUNDS = 10;

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
 * @param executeToolFn - Tool executor (bound to cruxId via createToolExecutor)
 * @param signal - AbortSignal for cancellation
 */
export async function* runConversation(
  adapter: ProviderAdapter,
  apiKey: string,
  cruxId: string,
  messages: NormalizedMessage[],
  model: string,
  executeToolFn: (
    name: string,
    input: Record<string, unknown>,
  ) => Promise<string>,
  signal?: AbortSignal,
): AsyncGenerator<ConversationEvent> {
  let systemPrompt = await buildSystemPrompt(cruxId);
  let currentMessages = [...messages];
  let fullTextContent = '';
  let hadMutation = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Trim messages if needed to fit context window
    const systemTokens = estimateTokens(systemPrompt);
    const { messages: trimmedMessages } = trimMessagesIfNeeded(
      currentMessages as { role: string; content: unknown }[],
      systemTokens,
    );
    currentMessages = trimmedMessages as NormalizedMessage[];

    // Stream the response
    let response;
    try {
      response = await adapter.stream({
        apiKey,
        systemPrompt,
        messages: currentMessages,
        model,
        tools: TOOL_DEFINITIONS,
        onText: (_text) => {
          // We can't yield from inside a callback, so text is accumulated
          // in the StreamResponse and yielded after
        },
        signal,
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      yield { type: 'error', message: err.message };
      return;
    }

    // Yield the text content
    if (response.textContent) {
      fullTextContent += response.textContent;
      yield { type: 'text', content: response.textContent };
    }

    // If no tool use, we're done
    if (response.stopReason !== 'tool_use' || response.toolCalls.length === 0) {
      yield {
        type: 'done',
        textContent: fullTextContent,
        hadMutation,
      };
      return;
    }

    // Process tool calls
    const toolResults: ContentBlock[] = [];
    let roundHadMutation = false;

    for (const toolUse of response.toolCalls) {
      yield {
        type: 'tool_start',
        name: toolUse.name,
        id: toolUse.id,
        input: toolUse.input,
      };

      const result = await executeToolFn(toolUse.name, toolUse.input);

      yield {
        type: 'tool_result',
        name: toolUse.name,
        id: toolUse.id,
        result,
      };

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });

      if (MUTATING_TOOLS.includes(toolUse.name)) {
        roundHadMutation = true;
        hadMutation = true;
      }
    }

    // Refresh system prompt after mutations so AI sees updated file listing
    if (roundHadMutation) {
      systemPrompt = await buildSystemPrompt(cruxId);
    }

    // Append assistant response + tool results for next round
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.fullContent },
      { role: 'user', content: toolResults },
    ];
  }

  // Ran out of rounds
  yield {
    type: 'done',
    textContent: fullTextContent,
    hadMutation,
  };
}
