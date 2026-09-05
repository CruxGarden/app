/**
 * The model a round talks to, built from what the visitor connected. The
 * game runs in the visitor's browser with the visitor's key (ADR 0016, where
 * inference runs); the key travels to its provider and nowhere else.
 *
 * `modelFor(config)` is the one seam: a `crux` provider (managed inference,
 * ADR 0015) slots in here later without the game noticing. A scripted model
 * on `window.__fiveWsModel` wins over everything — that is how the e2e suite
 * plays without a key.
 */

import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ModelConfig, ProviderId } from './local-state';

export interface ProviderInfo {
  id: Exclude<ProviderId, 'crux'>;
  label: string;
  defaultModel: string;
  /** Where a visitor gets a key. */
  keysUrl: string;
  /** What a key from this provider looks like, for the placeholder. */
  keyHint: string;
}

/** The providers a visitor can connect, in the order the form shows them. */
export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-5',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-…',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-5.6-sol',
    keysUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-…',
  },
  {
    id: 'google',
    label: 'Google',
    defaultModel: 'gemini-3.6-flash',
    keysUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza…',
  },
];

export function providerInfo(id: ProviderId): ProviderInfo | null {
  return PROVIDERS.find((p) => p.id === id) ?? null;
}

/** The model id a config resolves to. */
export function modelIdFor(config: ModelConfig): string {
  return config.model?.trim() || providerInfo(config.provider)?.defaultModel || '';
}

/**
 * Temperatures for the round's calls: the engine's defaults (answers warm,
 * adjudication cold), or `'default'` — send none — for providers whose
 * reasoning models reject the parameter.
 */
export function temperatureFor(config: ModelConfig): 'default' | undefined {
  return config.provider === 'openai' ? 'default' : undefined;
}

/** Why a config cannot be used, or null when it can. */
export function validateConfig(config: ModelConfig): string | null {
  if (config.provider === 'crux') return 'Managed inference is not available yet.';
  if (!providerInfo(config.provider)) return 'Choose a provider.';
  if (!config.apiKey?.trim()) return 'Paste a key.';
  return null;
}

declare global {
  interface Window {
    /** e2e only: a scripted LanguageModel the play page prefers when present. */
    __fiveWsModel?: LanguageModel;
  }
}

/** The injected scripted model, when the page carries one. */
export function injectedModel(): LanguageModel | null {
  if (typeof window === 'undefined') return null;
  return window.__fiveWsModel ?? null;
}

/**
 * Build the model for a round. Throws with a sentence the form can show when
 * the config cannot be used.
 */
export function modelFor(config: ModelConfig): LanguageModel {
  const injected = injectedModel();
  if (injected) return injected;
  const problem = validateConfig(config);
  if (problem) throw new Error(problem);
  const apiKey = config.apiKey!.trim();
  const id = modelIdFor(config);
  switch (config.provider) {
    case 'openai':
      return createOpenAI({ apiKey })(id);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(id);
    case 'anthropic':
      // Anthropic requires an explicit opt-in header for direct browser calls.
      return createAnthropic({
        apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      })(id);
    case 'crux':
      // The seam for managed inference (ADR 0015): a provider that takes no
      // key and talks to the API. Not offered until Credits exist.
      throw new Error('Managed inference is not available yet.');
  }
}
