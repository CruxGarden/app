/**
 * The Collaboration engine — the AI conversation loop behind one seam.
 *
 * Implemented on the AI SDK (`ai` package): real token streaming, the
 * multi-step tool loop (stopWhen), abort, per-model output budgets, and
 * cross-provider tool results (including images) all come from the SDK; the
 * bespoke per-provider adapters are gone (AI-COLLABORATION-PLAN Phase A1).
 *
 * The interface is unchanged for callers: an async generator of
 * ConversationEvent consumed by useChat (workspace chat) and the Keeper
 * Console (tool-less chat via ConversationOptions).
 */

import {
  streamText,
  generateText,
  stepCountIs,
  jsonSchema,
  tool,
  type ModelMessage,
  type ToolSet,
  type AssistantModelMessage,
  type ToolModelMessage,
  type UserModelMessage,
} from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { localBaseUrl, localModelName, type LocalProviderId } from './local';
import type { LanguageModel } from 'ai';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import type { NormalizedMessage, ToolResultContent } from '@/services/types';
import { defaultToolDefinitions, didMutate, type ToolDefinition } from './tools';
import { buildPromptParts, buildWorkspaceContext, CONTEXT_BLOCK_OPEN } from './system-prompt';
import { estimateTokens, fitToContextWindow, evictedTranscript, compactionNote } from './context';
import { getModelInfo, getProviderForModel, resolveModel } from './providers';

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
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedInputTokens: number };

const MAX_ROUNDS = 10;

/** Optional overrides — used by callers that aren't the crux workspace (e.g. the Keeper Console). */
export interface ConversationOptions {
  /** Use this system prompt verbatim instead of building the crux workspace prompt. */
  systemPrompt?: string;
  /** Tool set to offer the model. Pass [] for a plain chat with no tools. */
  tools?: ToolDefinition[];
  /**
   * Use this LanguageModel instead of resolving one from (model, apiKey).
   * The seam the eval harness injects mock models through (A6).
   */
  languageModel?: LanguageModel;
}

/**
 * Build an AI SDK language model for a (model, BYOK apiKey) pair.
 * Retired model IDs resolve to their successors.
 */
export function languageModelFor(model: string, apiKey: string): LanguageModel {
  const id = resolveModel(model);
  const provider = getProviderForModel(id);
  // Local inference (Ollama / LM Studio): OpenAI-compatible localhost API,
  // no key. main.ts shims CORS for these ports on desktop.
  if (provider === 'ollama' || provider === 'lmstudio') {
    return createOpenAICompatible({
      name: provider,
      baseURL: localBaseUrl(provider as LocalProviderId),
    })(localModelName(id));
  }
  if (provider === 'openai') {
    return createOpenAI({ apiKey })(id);
  }
  if (provider === 'google') {
    return createGoogleGenerativeAI({ apiKey })(id);
  }
  // Anthropic requires an explicit opt-in header for direct browser calls (BYOK).
  return createAnthropic({
    apiKey,
    headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
  })(id);
}

// ── Tool result conversion ──────────────────────────────────────────────────

type ToolResultBlocks = Exclude<ToolResultContent, string>;

/** UI display string for a tool result (text blocks only). */
function displayResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return (result as ToolResultBlocks)
      .filter((b) => b.type === 'text')
      .map((b) => ('text' in b ? b.text : ''))
      .join('\n');
  }
  return String(result ?? '');
}

type ToolOutputPart =
  | { type: 'text'; text: string }
  | { type: 'file'; data: { type: 'data'; data: string }; mediaType: string };

/**
 * Convert our executor's result (string, or Anthropic-style content blocks
 * with images) into the SDK's provider-agnostic tool output. This is what
 * makes read_file's vision results work on every provider.
 */
function toToolResultOutput(result: unknown): ToolResultOutput {
  if (typeof result === 'string') {
    return { type: 'text', value: result };
  }
  if (Array.isArray(result)) {
    const value = (result as ToolResultBlocks).flatMap((block): ToolOutputPart[] => {
      if (block.type === 'text') return [{ type: 'text', text: block.text }];
      if (block.type === 'image') {
        return [
          {
            type: 'file',
            data: { type: 'data', data: block.source.data },
            mediaType: block.source.media_type,
          },
        ];
      }
      return [];
    });
    return { type: 'content', value };
  }
  return { type: 'text', value: String(result ?? '') };
}

// ── Message conversion (NormalizedMessage → ModelMessage) ───────────────────

function toModelMessages(messages: NormalizedMessage[]): ModelMessage[] {
  // tool_use id → tool name (tool results must carry the name)
  const toolNames = new Map<string, string>();
  for (const msg of messages) {
    if (typeof msg.content !== 'string') {
      for (const block of msg.content) {
        if (block.type === 'tool_use') toolNames.set(block.id!, block.name!);
      }
    }
  }

  const out: ModelMessage[] = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role, content: msg.content } as ModelMessage);
      continue;
    }

    if (msg.role === 'assistant') {
      const content: AssistantModelMessage['content'] = [];
      for (const block of msg.content) {
        if (block.type === 'text') {
          content.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          content.push({
            type: 'tool-call',
            toolCallId: block.id!,
            toolName: block.name!,
            input: block.input,
          });
        }
      }
      if (content.length > 0) out.push({ role: 'assistant', content });
      continue;
    }

    // User message: tool results become a 'tool' message; text stays 'user'.
    const toolResults = msg.content.filter((b) => b.type === 'tool_result');
    const textBlocks = msg.content.filter((b) => b.type === 'text');

    if (toolResults.length > 0) {
      const content: ToolModelMessage['content'] = toolResults.map((tr) => ({
        type: 'tool-result',
        toolCallId: tr.tool_use_id!,
        toolName: toolNames.get(tr.tool_use_id!) || 'unknown_tool',
        output: toToolResultOutput(tr.content),
      }));
      out.push({ role: 'tool', content });
    }
    if (textBlocks.length > 0) {
      const content: UserModelMessage['content'] = textBlocks.map((b) => ({
        type: 'text',
        text: 'text' in b ? b.text! : '',
      }));
      out.push({ role: 'user', content });
    }
  }
  return out;
}

// ── The loop ────────────────────────────────────────────────────────────────

/**
 * Run the AI conversation loop.
 *
 * Yields ConversationEvents; text streams token-by-token.
 *
 * @param apiKey - User's API key for the model's provider (BYOK)
 * @param cruxId - The crux being worked on (for the workspace system prompt)
 * @param messages - Conversation history (normalized blocks)
 * @param model - Model ID (retired IDs upgrade automatically)
 * @param executeToolFn - Tool executor (bound to cruxId via createToolExecutor); omit for tool-less chats
 * @param signal - AbortSignal for cancellation
 * @param options - System prompt / tool overrides for non-workspace callers
 */
export async function* runConversation(
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
  const toolDefs = options?.tools ?? defaultToolDefinitions();
  // Stable prefix vs volatile workspace context (A2): the system prompt holds
  // only what survives across rounds (persona, rules, kind guidance) so
  // providers can cache it; the file list and content model ride in a
  // <workspace_context> user block that refreshes without busting the cache.
  const { system: systemPrompt, context: workspaceContext } = options?.systemPrompt
    ? { system: options.systemPrompt, context: '' }
    : await buildPromptParts(cruxId);
  let currentMessages = [...messages];
  let fullTextContent = '';
  let hadMutation = false;
  let mutatedSinceStep = false;
  let sawToolCall = false;

  const info = getModelInfo(model);

  // Fit history to THIS model's window (pair-safe, model-aware — A5). A 32k
  // local model and a 1M-context Claude get the right budget, and the kept
  // window never starts with an orphaned tool_result.
  const fixedTokens = estimateTokens(systemPrompt) + estimateTokens(workspaceContext);
  const fit = fitToContextWindow(currentMessages, {
    contextWindow: info?.contextWindow ?? 200000,
    maxOutput: info?.maxOutput ?? 16384,
    fixedTokens,
  });
  let contextNote: string | null = null;
  if (fit.trimmed) {
    currentMessages = fit.messages;
    // Compaction: summarize the evicted span (best-effort, cached) so the
    // model keeps the thread of the earlier conversation.
    const summary = await summarizeEvicted(fit.evicted, model, apiKey, options?.languageModel);
    contextNote = compactionNote(fit.evicted.length, summary);
    yield {
      type: 'info',
      message: summary
        ? `Older messages were summarized to fit the context window (${fit.evicted.length} messages).`
        : `Older messages were trimmed to fit the context window (${fit.evicted.length} messages).`,
    };
  }

  // Wrap our executor as an SDK tool set
  let toolSet: ToolSet | undefined;
  if (executeToolFn && toolDefs.length > 0) {
    toolSet = {};
    for (const def of toolDefs) {
      toolSet[def.name] = tool({
        description: def.description,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON schema boundary
        inputSchema: jsonSchema<Record<string, unknown>>(def.input_schema as any),
        execute: async (input: Record<string, unknown>) => {
          const result = await executeToolFn(def.name, input ?? {});
          // Only a real change counts — a blocked edit or a declined delete
          // must not trigger a context rebuild or an auto-snapshot.
          if (didMutate(def.name, result)) {
            hadMutation = true;
            mutatedSinceStep = true;
          }
          return result;
        },
        toModelOutput: ({ output }) => toToolResultOutput(output),
      });
    }
  }

  // The volatile context rides as the first user block, then the compaction
  // note (when history was evicted), then the fitted history. The stable
  // prefix goes in via `instructions` as a system message carrying the
  // Anthropic cache breakpoint (other providers ignore the anthropic
  // namespace and cache implicitly).
  const promptMessages: ModelMessage[] = [
    ...(workspaceContext ? [{ role: 'user', content: workspaceContext } as ModelMessage] : []),
    ...(contextNote ? [{ role: 'user', content: contextNote } as ModelMessage] : []),
    ...toModelMessages(currentMessages),
  ];

  let finishReason: string | undefined;
  try {
    const result = streamText({
      model: options?.languageModel ?? languageModelFor(model, apiKey),
      instructions: {
        role: 'system',
        content: systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
      },
      messages: promptMessages,
      ...(toolSet ? { tools: toolSet } : {}),
      stopWhen: stepCountIs(MAX_ROUNDS),
      abortSignal: signal,
      maxOutputTokens: info?.maxOutput ?? 16384,
      // Refresh the workspace context block after mutations so the model sees
      // the updated file listing — the stable system prompt is untouched, so
      // the provider cache survives (workspace prompts only; custom prompts
      // have no context block to refresh).
      prepareStep: options?.systemPrompt
        ? undefined
        : async ({ messages: stepMessages }) => {
            if (!mutatedSinceStep) return {};
            mutatedSinceStep = false;
            const fresh = await buildWorkspaceContext(cruxId);
            return {
              messages: stepMessages.map((m) =>
                m.role === 'user' &&
                typeof m.content === 'string' &&
                m.content.startsWith(CONTEXT_BLOCK_OPEN)
                  ? { ...m, content: fresh }
                  : m,
              ),
            };
          },
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          fullTextContent += part.text;
          yield { type: 'text', content: part.text };
          break;

        case 'tool-call':
          sawToolCall = true;
          yield {
            type: 'tool_start',
            name: part.toolName,
            id: part.toolCallId,
            input: (part.input ?? {}) as Record<string, unknown>,
          };
          break;

        case 'tool-result':
          yield {
            type: 'tool_result',
            name: part.toolName,
            id: part.toolCallId,
            result: displayResult(part.output),
          };
          break;

        case 'tool-error':
          yield {
            type: 'tool_result',
            name: part.toolName,
            id: part.toolCallId,
            result: `Error: ${String((part as { error?: unknown }).error ?? 'tool failed')}`,
          };
          break;

        case 'finish-step':
          if (part.usage) {
            yield {
              type: 'usage',
              inputTokens: part.usage.inputTokens ?? 0,
              outputTokens: part.usage.outputTokens ?? 0,
              cachedInputTokens: part.usage.inputTokenDetails?.cacheReadTokens ?? 0,
            };
          }
          break;

        case 'finish':
          finishReason = part.finishReason;
          break;

        case 'abort':
          return;

        case 'error': {
          yield { type: 'error', message: friendlyError(part.error) };
          return;
        }
      }
    }
  } catch (err: unknown) {
    const e = err as Error;
    if (e.name === 'AbortError' || signal?.aborted) return;
    yield { type: 'error', message: friendlyError(err) };
    return;
  }

  // Truncation with no usable content (mirrors the previous engine's guard)
  if (finishReason === 'length' && !fullTextContent && !sawToolCall) {
    yield {
      type: 'error',
      message:
        'Response was truncated (max_tokens reached with no usable content). The file may be too large for a single operation.',
    };
    return;
  }

  // Hit the round cap mid-plan: the model still wanted to call tools. Say so —
  // silently stopping looks like the task finished.
  if (finishReason === 'tool-calls') {
    yield {
      type: 'info',
      message: `Stopped after ${MAX_ROUNDS} tool rounds. Ask me to continue if the task isn't finished.`,
    };
  }

  yield {
    type: 'done',
    textContent: fullTextContent,
    hadMutation,
  };
}

// ── Compaction (A5) ─────────────────────────────────────────────────────────

/**
 * Session cache for evicted-span summaries, keyed by the CONTENT of the span.
 *
 * Keying on (cruxId, count) collided across revert and branch: restoring a
 * snapshot truncates history in place, so a regrown conversation that reached
 * the same evicted count would be handed a summary of the abandoned branch.
 * Content identity has no such ambiguity, and it also means a boundary that
 * merely grows by one message reuses nothing stale.
 */
const compactionCache = new Map<string, string>();
const COMPACTION_CACHE_LIMIT = 32;

function compactionKey(transcript: string): string {
  // Cheap non-cryptographic digest — this only has to distinguish spans
  let hash = 0;
  for (let i = 0; i < transcript.length; i++) {
    hash = (hash * 31 + transcript.charCodeAt(i)) | 0;
  }
  return `${transcript.length}:${hash}`;
}

async function summarizeEvicted(
  evicted: NormalizedMessage[],
  model: string,
  apiKey: string,
  languageModel?: LanguageModel,
): Promise<string | null> {
  if (evicted.length === 0) return null;
  const transcript = evictedTranscript(evicted);
  const cacheKey = compactionKey(transcript);
  const cached = compactionCache.get(cacheKey);
  if (cached) return cached;
  try {
    const { text } = await generateText({
      // Honour the injected model so the eval harness never reaches the network
      model: languageModel ?? languageModelFor(model, apiKey),
      system:
        'Summarize this conversation excerpt from a creative-workspace session. ' +
        'Capture decisions made, files created or changed, user preferences, and unfinished work. ' +
        'Write a dense factual summary in under 300 words — no preamble.',
      prompt: transcript,
      maxOutputTokens: 500,
    });
    const summary = text.trim();
    if (!summary) return null;
    if (compactionCache.size >= COMPACTION_CACHE_LIMIT) {
      compactionCache.delete(compactionCache.keys().next().value!);
    }
    compactionCache.set(cacheKey, summary);
    return summary;
  } catch {
    return null; // best-effort — the bare trim note still ships
  }
}

/** Map SDK/provider errors to user-facing messages. */
function friendlyError(error: unknown): string {
  const e = error as { statusCode?: number; status?: number; message?: string };
  const status = e?.statusCode ?? e?.status;
  if (status === 429 || status === 529 || status === 503) {
    return 'The AI service is temporarily overloaded. Please try again in a moment.';
  }
  return e?.message || String(error);
}
