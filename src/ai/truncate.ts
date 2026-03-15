import type { NormalizedMessage } from '@/services/types';
import { getModelInfo } from './providers';

/**
 * Estimate token count for a string.
 * Uses ~4 chars per token as a rough approximation.
 * Intentionally conservative (overestimates) to avoid hitting limits.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Estimate tokens for a single message */
function messageTokens(msg: NormalizedMessage): number {
  if (typeof msg.content === 'string') {
    return estimateTokens(msg.content) + 4; // role + framing overhead
  }
  // Array of content blocks
  let tokens = 4;
  for (const block of msg.content) {
    if (block.type === 'text') {
      tokens += estimateTokens(block.text);
    } else if (block.type === 'tool_use') {
      tokens += estimateTokens(JSON.stringify(block.input)) + 20;
    } else if (block.type === 'tool_result') {
      tokens += estimateTokens(block.content) + 10;
    } else {
      tokens += 100; // unknown block type fallback
    }
  }
  return tokens;
}

/**
 * Truncate messages to fit within a model's context window.
 * Keeps the system prompt budget separate, preserves the most recent messages,
 * and drops oldest messages first.
 *
 * Always keeps at least the last message (the user's current input).
 */
export function truncateMessages(
  messages: NormalizedMessage[],
  model: string,
  systemPrompt: string,
  toolsOverhead = 0,
): NormalizedMessage[] {
  const info = getModelInfo(model);
  if (!info) return messages; // unknown model, pass through

  const maxOutput = info.maxOutput;
  const systemTokens = estimateTokens(systemPrompt);
  const budget = info.contextWindow - maxOutput - systemTokens - toolsOverhead - 200; // 200 token safety margin

  if (budget <= 0) return messages.slice(-1); // degenerate case

  // Calculate tokens for each message
  const tokenCounts = messages.map(messageTokens);
  const totalTokens = tokenCounts.reduce((sum, t) => sum + t, 0);

  // If it fits, no truncation needed
  if (totalTokens <= budget) return messages;

  // Drop messages from the start until we fit, always keeping the last message
  let trimmedTokens = totalTokens;
  let startIndex = 0;

  while (trimmedTokens > budget && startIndex < messages.length - 1) {
    trimmedTokens -= tokenCounts[startIndex]!;
    startIndex++;

    // If we split a user/assistant pair, skip to keep pairs together
    // (don't leave an orphaned assistant response without its user prompt)
    if (
      startIndex < messages.length - 1 &&
      messages[startIndex]?.role === 'assistant'
    ) {
      trimmedTokens -= tokenCounts[startIndex]!;
      startIndex++;
    }
  }

  return messages.slice(startIndex);
}
