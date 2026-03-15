import type { ProviderAdapter, StreamOptions } from './types';
import { getProviderForModel } from '../providers';
import { truncateMessages } from '../truncate';

/**
 * Get the appropriate adapter for a model.
 * Adapters are dynamically imported so only the active provider's SDK is loaded.
 * Returns a wrapper that auto-truncates messages to fit the model's context window.
 */
export async function getAdapter(model: string): Promise<ProviderAdapter> {
  const providerId = getProviderForModel(model);

  let inner: ProviderAdapter;
  switch (providerId) {
    case 'anthropic': {
      const { AnthropicAdapter } = await import('./anthropic');
      inner = new AnthropicAdapter();
      break;
    }
    case 'openai': {
      const { OpenAIAdapter } = await import('./openai');
      inner = new OpenAIAdapter();
      break;
    }
    case 'google': {
      const { GoogleAdapter } = await import('./google');
      inner = new GoogleAdapter();
      break;
    }
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }

  // Wrap with auto-truncation
  return {
    stream(opts: StreamOptions) {
      const toolsOverhead = opts.tools.length * 200; // rough estimate per tool definition
      const truncated = truncateMessages(
        opts.messages,
        opts.model,
        opts.systemPrompt,
        toolsOverhead,
      );
      return inner.stream({ ...opts, messages: truncated });
    },
  };
}

export type { ProviderAdapter, StreamOptions, StreamResponse, ToolDefinition, ToolUseBlock } from './types';
