import type { NormalizedMessage, ContentBlock } from '@/services/types';

/** Tool definition matching Anthropic's tool schema format */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
}

/** A tool_use block from the model's response */
export interface ToolUseBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** Normalized response from a provider's streaming call */
export interface StreamResponse {
  stopReason: string; // 'end_turn' | 'tool_use' | 'max_tokens'
  toolCalls: ToolUseBlock[];
  textContent: string;
  fullContent: ContentBlock[]; // Raw blocks for next round
}

/** Options passed to the adapter's stream method */
export interface StreamOptions {
  apiKey: string;
  systemPrompt: string;
  messages: NormalizedMessage[];
  model: string;
  tools: ToolDefinition[];
  onText: (text: string) => void;
  signal?: AbortSignal;
  maxTokens?: number;
}

/**
 * Provider adapter interface.
 * Each AI provider (Anthropic, OpenAI, Google) implements this.
 * Adapters normalize different SDK APIs into a single contract.
 */
export interface ProviderAdapter {
  stream(opts: StreamOptions): Promise<StreamResponse>;
}
