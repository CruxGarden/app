/**
 * Local inference (AI-COLLABORATION-PLAN Phase A4) — Ollama and LM Studio.
 *
 * Detection runs in the Electron main process (localai bridge); chat goes
 * straight from the renderer to the local server's OpenAI-compatible API
 * (main.ts shims CORS for those ports). Local model IDs are namespaced as
 * "ollama/<model>" or "lmstudio/<model>" so they coexist with cloud IDs in
 * crux settings, and no API key is required.
 */

import { Capability, can, type LocalAiEndpoint } from '@/lib/platform';

export type LocalProviderId = 'ollama' | 'lmstudio';

/** Placeholder credential for local providers — they authenticate nothing. */
export const LOCAL_API_KEY = 'local';

const BASE_URLS: Record<LocalProviderId, string> = {
  ollama: 'http://127.0.0.1:11434/v1',
  lmstudio: 'http://127.0.0.1:1234/v1',
};

export function isLocalModel(modelId: string): boolean {
  return modelId.startsWith('ollama/') || modelId.startsWith('lmstudio/');
}

/** "ollama/qwen3-coder:30b" → 'ollama'; null for cloud IDs. */
export function localProviderOf(modelId: string): LocalProviderId | null {
  if (modelId.startsWith('ollama/')) return 'ollama';
  if (modelId.startsWith('lmstudio/')) return 'lmstudio';
  return null;
}

/** "ollama/qwen3-coder:30b" → "qwen3-coder:30b" (the ID the server knows). */
export function localModelName(modelId: string): string {
  const idx = modelId.indexOf('/');
  return idx === -1 ? modelId : modelId.slice(idx + 1);
}

export function localBaseUrl(provider: LocalProviderId): string {
  return BASE_URLS[provider];
}

/**
 * Model families known to handle tool calling well enough for the workspace
 * loop (the picker steers toward these — plan §A4). Substring match against
 * the server's model name.
 */
const TOOL_CAPABLE_FAMILIES = [
  'qwen3-coder',
  'qwen3',
  'qwen2.5-coder',
  'devstral',
  'mistral-small',
  'magistral',
  'llama3.3',
  'llama3.1',
  'command-r',
  'granite',
  'hermes',
  'gpt-oss',
];

export function isToolCapableLocalModel(serverModelName: string): boolean {
  const name = serverModelName.toLowerCase();
  return TOOL_CAPABLE_FAMILIES.some((family) => name.includes(family));
}

/** Sort tool-capable models first, then alphabetical. */
export function sortLocalModels(models: string[]): string[] {
  return [...models].sort((a, b) => {
    const ta = isToolCapableLocalModel(a) ? 0 : 1;
    const tb = isToolCapableLocalModel(b) ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });
}

let cache: LocalAiEndpoint[] | null = null;

/**
 * Probe for running local inference servers. Fast when nothing is running
 * (connection refused); results are cached, and `refresh` re-probes so the
 * picker stays current when the user starts/stops a server.
 */
export async function detectLocalEndpoints(refresh = false): Promise<LocalAiEndpoint[]> {
  if (!can(Capability.LocalInference)) return [];
  if (cache && !refresh) return cache;
  try {
    cache = await window.electronAPI!.localai.detect();
    return cache;
  } catch {
    // Don't cache a failed probe — one transient error would hide running
    // servers for the rest of the session.
    return [];
  }
}
