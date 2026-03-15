/**
 * Provider registry — maps provider IDs to display names, default models,
 * and adapter import paths. Adapters are dynamically imported so only
 * the active provider's SDK is loaded.
 */

export type ProviderCapability = 'Chat' | 'Files' | 'Images';

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number; // max input tokens
  maxOutput: number;     // max output tokens
}

export interface ProviderInfo {
  id: string;
  name: string;
  defaultModel: string;
  models: ModelInfo[];
  capabilities: ProviderCapability[];
  keyUrl: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, maxOutput: 16384 },
      { id: 'claude-haiku-4-20250414', name: 'Claude Haiku 4', contextWindow: 200000, maxOutput: 8192 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000, maxOutput: 16384 },
    ],
    capabilities: ['Chat', 'Files'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxOutput: 16384 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxOutput: 16384 },
      { id: 'o3-mini', name: 'o3-mini', contextWindow: 200000, maxOutput: 100000 },
    ],
    capabilities: ['Chat', 'Files', 'Images'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576, maxOutput: 65536 },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576, maxOutput: 65536 },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, maxOutput: 8192 },
    ],
    capabilities: ['Chat', 'Files', 'Images'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
};

/** Look up model info by model ID */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  for (const provider of Object.values(PROVIDERS)) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model;
  }
  return undefined;
}

/** Derive provider ID from a model string */
export function getProviderForModel(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  // Default to anthropic
  return 'anthropic';
}
