/**
 * What the play page remembers in this browser — and nothing more.
 *
 * Three things: the AI the visitor connected (provider, key, model) so the
 * next round needs no setup; the sign-in tokens for the daily board; and
 * which UTC day this browser last played a shelf's daily figure, so the
 * first round of a day is the daily and the rest are practice. The key goes
 * to its provider and nowhere else — nothing here posts it anywhere.
 *
 * Every function takes the storage so it can be tested without a window;
 * `defaultStorage()` is `localStorage`, falling back to memory when that is
 * unavailable (private mode, a blocked origin).
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEYS = {
  model: '5ws:model',
  auth: '5ws:auth',
  /** Prefix; the shelf id follows. */
  daily: '5ws:daily:',
} as const;

/** The providers a visitor can connect. `crux` is the seam for managed inference (ADR 0015) — not offered yet. */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'crux';

export interface ModelConfig {
  provider: ProviderId;
  /** The visitor's own key. Absent for `crux`. */
  apiKey?: string;
  /** A model id; the provider's default when absent. */
  model?: string;
}

/** Sign-in tokens from the API's email-code flow, and the account's username — the name on the board. */
export interface StoredAuth {
  accessToken: string;
  refreshToken: string;
  email: string;
  name: string;
}

const memory = new Map<string, string>();
const memoryStorage: KeyValueStorage = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

/** `localStorage` when it works, memory when it does not. Never throws. */
export function defaultStorage(): KeyValueStorage {
  try {
    const ls = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (!ls) return memoryStorage;
    const probe = '5ws:probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStorage;
  }
}

// ── The connected AI ────────────────────────────────────────────────────────

const PROVIDER_IDS: readonly ProviderId[] = ['anthropic', 'openai', 'google', 'crux'];

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && (PROVIDER_IDS as readonly string[]).includes(v);
}

export function loadModelConfig(storage: KeyValueStorage): ModelConfig | null {
  try {
    const raw = storage.getItem(STORAGE_KEYS.model);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<ModelConfig>;
    if (!isProviderId(v.provider)) return null;
    const apiKey = typeof v.apiKey === 'string' && v.apiKey.trim() ? v.apiKey.trim() : undefined;
    if (v.provider !== 'crux' && !apiKey) return null;
    const model = typeof v.model === 'string' && v.model.trim() ? v.model.trim() : undefined;
    return { provider: v.provider, ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) };
  } catch {
    return null;
  }
}

export function saveModelConfig(storage: KeyValueStorage, config: ModelConfig): void {
  storage.setItem(STORAGE_KEYS.model, JSON.stringify(config));
}

export function clearModelConfig(storage: KeyValueStorage): void {
  storage.removeItem(STORAGE_KEYS.model);
}

// ── Sign-in for the board ───────────────────────────────────────────────────

export function loadAuth(storage: KeyValueStorage): StoredAuth | null {
  try {
    const raw = storage.getItem(STORAGE_KEYS.auth);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredAuth>;
    if (typeof v.accessToken !== 'string' || !v.accessToken) return null;
    // No name, no board: a sign-in from before names were kept starts over
    if (typeof v.name !== 'string' || !v.name.trim()) return null;
    return {
      accessToken: v.accessToken,
      refreshToken: typeof v.refreshToken === 'string' ? v.refreshToken : '',
      email: typeof v.email === 'string' ? v.email : '',
      name: v.name.trim(),
    };
  } catch {
    return null;
  }
}

export function saveAuth(storage: KeyValueStorage, auth: StoredAuth): void {
  storage.setItem(STORAGE_KEYS.auth, JSON.stringify(auth));
}

export function clearAuth(storage: KeyValueStorage): void {
  storage.removeItem(STORAGE_KEYS.auth);
}

// ── The daily figure ────────────────────────────────────────────────────────

/** The board's day: UTC, YYYY-MM-DD. Also the seed for today's figure. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** True when this browser has not yet played today's figure on this shelf. */
export function dailyAvailable(storage: KeyValueStorage, shelfId: string, now?: Date): boolean {
  return storage.getItem(STORAGE_KEYS.daily + shelfId) !== utcDay(now);
}

/** Record that today's figure has been played here (called when a daily round ends). */
export function markDailyPlayed(storage: KeyValueStorage, shelfId: string, now?: Date): void {
  storage.setItem(STORAGE_KEYS.daily + shelfId, utcDay(now));
}
