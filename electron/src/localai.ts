/**
 * Local inference detection (AI-COLLABORATION-PLAN Phase A4).
 *
 * Probes the well-known localhost endpoints for Ollama and LM Studio from the
 * main process (no CORS there) and reports which are running and what models
 * they serve. The renderer talks to the endpoints directly for chat — main.ts
 * rewrites the Origin header on those requests so the servers accept the
 * packaged app's crux-app:// origin.
 */

export interface LocalAiEndpoint {
  id: 'ollama' | 'lmstudio';
  name: string;
  /** OpenAI-compatible base URL the renderer should use for chat. */
  baseUrl: string;
  models: string[];
}

const PROBE_TIMEOUT_MS = 1500;

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // not running — the normal case
  } finally {
    clearTimeout(timer);
  }
}

export async function detectLocalAi(): Promise<LocalAiEndpoint[]> {
  const [ollama, lmstudio] = await Promise.all([
    fetchJson('http://127.0.0.1:11434/api/tags'),
    fetchJson('http://127.0.0.1:1234/v1/models'),
  ]);

  const endpoints: LocalAiEndpoint[] = [];

  if (ollama && Array.isArray(ollama.models)) {
    const models = ollama.models
      .map((m: any) => m?.name ?? m?.model)
      .filter((name: unknown): name is string => typeof name === 'string');
    endpoints.push({
      id: 'ollama',
      name: 'Ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      models,
    });
  }

  if (lmstudio && Array.isArray(lmstudio.data)) {
    const models = lmstudio.data
      .map((m: any) => m?.id)
      .filter((id: unknown): id is string => typeof id === 'string');
    endpoints.push({
      id: 'lmstudio',
      name: 'LM Studio',
      baseUrl: 'http://127.0.0.1:1234/v1',
      models,
    });
  }

  return endpoints;
}
