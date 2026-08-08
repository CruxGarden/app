/**
 * Provider registry — maps provider IDs to display names, default models,
 * and model metadata. Model IDs verified against provider docs 2026-07-31
 * (see AI-COLLABORATION-PLAN.md Phase A0); retired IDs stored in old cruxes
 * are upgraded via resolveModel().
 */

import { isLocalModel, localModelName, localProviderOf } from './local';

export type ProviderCapability = 'Chat' | 'Files' | 'Images';

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number; // max input tokens
  maxOutput: number; // max output tokens
}

export interface ProviderInfo {
  id: string;
  name: string;
  defaultModel: string;
  models: ModelInfo[];
  capabilities: ProviderCapability[];
  keyUrl: string;
}

/** The app-wide default chat model (used when a crux has no model setting). */
export const DEFAULT_MODEL = 'claude-sonnet-5';

export const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: DEFAULT_MODEL,
    models: [
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', contextWindow: 1000000, maxOutput: 128000 },
      { id: 'claude-fable-5', name: 'Claude Fable 5', contextWindow: 1000000, maxOutput: 128000 },
      { id: 'claude-opus-5', name: 'Claude Opus 5', contextWindow: 1000000, maxOutput: 128000 },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        contextWindow: 200000,
        maxOutput: 64000,
      },
    ],
    capabilities: ['Chat', 'Files'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-5.6-terra',
    models: [
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 1050000, maxOutput: 128000 },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: 1050000, maxOutput: 128000 },
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', contextWindow: 1050000, maxOutput: 128000 },
    ],
    capabilities: ['Chat', 'Files', 'Images'],
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  google: {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-3.6-flash',
    models: [
      {
        id: 'gemini-3.6-flash',
        name: 'Gemini 3.6 Flash',
        contextWindow: 1048576,
        maxOutput: 65536,
      },
      {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        contextWindow: 1048576,
        maxOutput: 65536,
      },
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite',
        contextWindow: 1048576,
        maxOutput: 65536,
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        contextWindow: 1000000,
        maxOutput: 65536,
      },
    ],
    capabilities: ['Chat', 'Files', 'Images'],
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  // Local inference (Phase A4) — models are discovered at runtime via the
  // localai bridge (see src/ai/local.ts), so the static lists stay empty.
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    defaultModel: '',
    models: [],
    capabilities: ['Chat', 'Files'],
    keyUrl: 'https://ollama.com/download',
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    defaultModel: '',
    models: [],
    capabilities: ['Chat', 'Files'],
    keyUrl: 'https://lmstudio.ai',
  },
};

/**
 * Retired model IDs (stored in older cruxes' settings) mapped to their
 * current equivalents. resolveModel() upgrades at read time; unknown IDs
 * pass through untouched.
 */
const RETIRED_MODELS: Record<string, string> = {
  // Anthropic (pre-Claude-5)
  'claude-sonnet-4-20250514': 'claude-sonnet-5',
  'claude-opus-4-20250514': 'claude-opus-5',
  'claude-haiku-4-20250414': 'claude-haiku-4-5-20251001',
  'claude-haiku-3-5-20241022': 'claude-haiku-4-5-20251001',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
  // OpenAI (pre-GPT-5.6)
  'gpt-4o': 'gpt-5.6-terra',
  'gpt-4o-mini': 'gpt-5.6-luna',
  'o3-mini': 'gpt-5.6-sol',
  // Google (pre-Gemini-3.x)
  'gemini-2.5-pro': 'gemini-3.1-pro-preview',
  'gemini-2.5-flash': 'gemini-3.6-flash',
  'gemini-2.0-flash': 'gemini-3.6-flash',
};

export function resolveModel(model: string | undefined | null): string {
  if (!model) return DEFAULT_MODEL;
  return RETIRED_MODELS[model] || model;
}

/** Look up model info by model ID (retired IDs resolve to their successors) */
export function getModelInfo(modelId: string): ModelInfo | undefined {
  const id = resolveModel(modelId);
  // Local models: capabilities vary per model and the server doesn't report
  // limits — use conservative defaults that keep the loop safe everywhere.
  if (isLocalModel(id)) {
    return { id, name: localModelName(id), contextWindow: 32768, maxOutput: 8192 };
  }
  for (const provider of Object.values(PROVIDERS)) {
    const model = provider.models.find((m) => m.id === id);
    if (model) return model;
  }
  return undefined;
}

/** Get short display name for a model ID (e.g. "claude-sonnet-5" → "Claude Sonnet 5") */
export function getModelShortName(modelId?: string): string | null {
  if (!modelId) return null;
  return getModelInfo(modelId)?.name ?? null;
}

/** Derive provider ID from a model string */
export function getProviderForModel(model: string): string {
  const local = localProviderOf(model);
  if (local) return local;
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o3') || model.startsWith('o4')) return 'openai';
  if (model.startsWith('gemini')) return 'google';
  // Default to anthropic
  return 'anthropic';
}
