/**
 * Provider registry — maps provider IDs to display names, default models,
 * and adapter import paths. Adapters are dynamically imported so only
 * the active provider's SDK is loaded.
 */

export type ProviderCapability = 'Chat' | 'Files' | 'Images';

export interface ProviderInfo {
  id: string;
  name: string;
  defaultModel: string;
  models: { id: string; name: string }[];
  capabilities: ProviderCapability[];
  keyUrl: string;
}

export const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
      { id: 'claude-haiku-4-20250414', name: 'Claude Haiku 4' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    ],
    capabilities: ['Chat', 'Files'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
    capabilities: ['Chat', 'Files', 'Images'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
    ],
    capabilities: ['Chat', 'Files', 'Images'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
};

/** Derive provider ID from a model string */
export function getProviderForModel(model: string): string {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  // Default to anthropic
  return 'anthropic';
}
