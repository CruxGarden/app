import type { ProviderAdapter } from './types';
import { getProviderForModel } from '../providers';

/**
 * Get the appropriate adapter for a model.
 * Adapters are dynamically imported so only the active provider's SDK is loaded.
 */
export async function getAdapter(model: string): Promise<ProviderAdapter> {
  const providerId = getProviderForModel(model);

  switch (providerId) {
    case 'anthropic': {
      const { AnthropicAdapter } = await import('./anthropic');
      return new AnthropicAdapter();
    }
    case 'openai': {
      const { OpenAIAdapter } = await import('./openai');
      return new OpenAIAdapter();
    }
    case 'google': {
      const { GoogleAdapter } = await import('./google');
      return new GoogleAdapter();
    }
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

export type { ProviderAdapter, StreamOptions, StreamResponse, ToolDefinition, ToolUseBlock } from './types';
