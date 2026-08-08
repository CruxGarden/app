/**
 * Context lifecycle (AI-COLLABORATION-PLAN Phase A5) — the single place
 * conversation history is fitted to a model's context window.
 *
 * Replaces the old fixed-150k `trimMessagesIfNeeded`: the budget now comes
 * from the actual model (a 32k local model and a 1M Claude window get the
 * right answer), and eviction is PAIR-SAFE — the kept window never starts
 * with an orphaned tool_result (whose tool_use was evicted), which is what
 * used to 400 mid-conversation on Anthropic.
 */

import type { NormalizedMessage } from '@/services/types';

// ── Token estimation ──────────────────────────────────────────────────────

/** Conservative token estimate: ~3.5 chars per token for English text */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Rough cost of one image block — vision tokens don't come from its byte length. */
const IMAGE_BLOCK_TOKENS = 1600;

/** Tokens for one tool_result payload, which may itself be a block array. */
function estimateToolResultTokens(content: unknown): number {
  if (typeof content === 'string') return estimateTokens(content);
  if (!Array.isArray(content)) return estimateTokens(String(content ?? ''));
  let total = 0;
  for (const block of content as { type?: string; text?: string }[]) {
    if (block.type === 'image') total += IMAGE_BLOCK_TOKENS;
    else if (block.text) total += estimateTokens(block.text);
  }
  return total;
}

/** Estimate tokens for a message array */
export function estimateMessageTokens(messages: { role: string; content: unknown }[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content);
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === 'image') total += IMAGE_BLOCK_TOKENS;
      if (block.text) total += estimateTokens(block.text);
      // tool_result content: String(...) on an array of blocks yields
      // "[object Object]" — four tokens for what may be a megabyte of image.
      if (block.content !== undefined) total += estimateToolResultTokens(block.content);
      if (block.input) total += estimateTokens(JSON.stringify(block.input));
    }
  }
  return total;
}

// ── Fitting ───────────────────────────────────────────────────────────────

export interface FitOptions {
  /** The model's total context window (input side), in tokens. */
  contextWindow: number;
  /** Output budget reserved for the response (the model's maxOutput). */
  maxOutput: number;
  /** Tokens already spoken for: system prompt + workspace context block. */
  fixedTokens: number;
}

export interface FitResult {
  messages: NormalizedMessage[];
  /** Everything evicted from the front, in original order (for compaction). */
  evicted: NormalizedMessage[];
  trimmed: boolean;
}

/**
 * Safety margin for estimation error and per-message protocol overhead.
 *
 * The char-per-token estimate is optimistic for code (real tokenizers land
 * nearer 3.0 than 3.5), and that error scales with the conversation — so the
 * margin scales with the window instead of being a flat constant that a large
 * window would dwarf.
 */
const MARGIN_FLOOR_TOKENS = 2000;
const MARGIN_FRACTION = 0.05;

function marginFor(contextWindow: number): number {
  return Math.max(MARGIN_FLOOR_TOKENS, Math.floor(contextWindow * MARGIN_FRACTION));
}

function hasToolResult(msg: NormalizedMessage): boolean {
  return (
    typeof msg.content !== 'string' && msg.content.some((block) => block.type === 'tool_result')
  );
}

/**
 * A message the window can safely start with: a real user turn — not an
 * assistant message (alternation) and not a tool_result carrier (its
 * tool_use lives in the evicted assistant message before it).
 */
function isCleanStart(msg: NormalizedMessage): boolean {
  return msg.role === 'user' && !hasToolResult(msg);
}

/**
 * Strip leading tool_result blocks from a message, keeping any text.
 *
 * The last-resort pair-safety repair: a window that must start here but whose
 * first message carries tool_results whose tool_use was evicted.
 */
function withoutOrphanToolResults(msg: NormalizedMessage): NormalizedMessage {
  if (typeof msg.content === 'string') return msg;
  const kept = msg.content.filter((block) => block.type !== 'tool_result');
  const note = {
    type: 'text' as const,
    text: '[Earlier tool results were dropped to fit the context window.]',
  };
  return { ...msg, content: kept.length > 0 ? [note, ...kept] : [note] };
}

/**
 * Fit conversation history into the model's context window by evicting the
 * oldest messages. Invariants on the kept window:
 *
 * 1. It fits: estimated tokens ≤ contextWindow − fixedTokens − maxOutput − margin.
 * 2. It starts clean: the first message is a user turn carrying no orphaned
 *    tool_result blocks — enforced, not merely searched for. Tool results ride
 *    on the *following* user message, so in a tool-heavy conversation there may
 *    be no clean turn between the cut and the end; when the scan runs out, the
 *    first kept message is repaired instead of shipped broken (an orphaned
 *    tool_result is a hard 400 on Anthropic).
 * 3. The newest message is always kept, even if the budget says otherwise —
 *    an over-budget single message is the provider's error to report, not
 *    something silent eviction can fix.
 */
export function fitToContextWindow(messages: NormalizedMessage[], options: FitOptions): FitResult {
  const available =
    options.contextWindow -
    options.fixedTokens -
    options.maxOutput -
    marginFor(options.contextWindow);

  let start = 0;
  let tokens = estimateMessageTokens(messages);

  // Evict oldest-first until the window fits, never past the newest message
  while (tokens > available && messages.length - start > 1) {
    tokens -= estimateMessageTokens([messages[start]!]);
    start++;
  }

  if (start === 0) {
    return { messages, evicted: [], trimmed: false };
  }

  // Pair-safety: prefer landing on a clean user turn…
  let cleanStart = start;
  while (cleanStart < messages.length - 1 && !isCleanStart(messages[cleanStart]!)) {
    cleanStart++;
  }

  const kept = messages.slice(cleanStart);
  // …and if none exists before the newest message, repair the first one.
  if (kept.length > 0 && !isCleanStart(kept[0]!)) {
    kept[0] = withoutOrphanToolResults(kept[0]!);
  }

  return {
    messages: kept,
    evicted: messages.slice(0, cleanStart),
    trimmed: true,
  };
}

// ── Compaction ────────────────────────────────────────────────────────────

/** Flatten an evicted span to plain text for summarization (text blocks only). */
export function evictedTranscript(evicted: NormalizedMessage[], maxChars = 40000): string {
  const lines: string[] = [];
  for (const msg of evicted) {
    if (typeof msg.content === 'string') {
      lines.push(`${msg.role}: ${msg.content}`);
      continue;
    }
    for (const block of msg.content) {
      if (block.type === 'text' && block.text) {
        lines.push(`${msg.role}: ${block.text}`);
      } else if (block.type === 'tool_use') {
        lines.push(`${msg.role}: [called ${block.name}]`);
      }
    }
  }
  const text = lines.join('\n');
  return text.length <= maxChars ? text : text.slice(-maxChars);
}

/** The note injected in place of evicted history (with or without a summary). */
export function compactionNote(evictedCount: number, summary: string | null): string {
  const header = `[Context note: the ${evictedCount} earliest messages of this conversation were removed to fit the model's context window.]`;
  return summary ? `${header}\nSummary of the removed conversation:\n${summary}` : header;
}
