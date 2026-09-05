/**
 * Today's board, and the email-code sign-in that lets a visitor join it.
 *
 * One day, one figure, one counted round per player: the first round of a
 * UTC day on a shelf is the daily and may be posted; the rest is practice.
 * The API keeps the board (`LeaderboardController`); this page reads it, and
 * posts a daily score once the visitor has signed in. Plain `fetch`, no
 * dependency — this file is written into the published site.
 *
 *   GET  /cruxes/:cruxId/leaderboard/:day   public;  day = 'today' | YYYY-MM-DD
 *   POST /cruxes/:cruxId/leaderboard/:day   auth;    { score: 0..10, seconds: 0..330 }
 *   POST /auth/code   { email }             → a code by email
 *   POST /auth/login  { email, code }       → { accessToken, refreshToken }
 */

export interface LeaderboardEntry {
  name: string;
  score: number;
  seconds: number;
  /** ISO timestamp the round was recorded. */
  at: string;
}

export interface LeaderboardYou {
  rank: number;
  score: number;
  seconds: number;
  /** False when the server already had a round from this player today (practice). */
  counted: boolean;
}

export interface Leaderboard {
  /** YYYY-MM-DD, UTC. */
  day: string;
  entries: LeaderboardEntry[];
  you: LeaderboardYou | null;
}

/** Body of POST /cruxes/:id/leaderboard/:day (the API's PostScoreDto). */
export interface PostScoreBody {
  score: number;
  seconds: number;
}

export interface SiteConfig {
  /** The crux this site is; null when the page cannot tell (a local preview). */
  cruxId: string | null;
  apiBase: string;
}

/**
 * Where this site's crux lives. A published page learns both from the publish
 * injection (`window.crux.publish`); failing that, its `{cruxId}.publish.*`
 * hostname; a local preview has neither, and the board stays quiet.
 */
export function siteConfig(win: Window | undefined = globalThis.window): SiteConfig {
  const cfg = (win as { crux?: { publish?: { cruxId?: string; apiBase?: string } } } | undefined)
    ?.crux?.publish;
  const fromHost = win ? /^([^.]+)\.publish\./.exec(win.location.hostname)?.[1] : undefined;
  return {
    cruxId: cfg?.cruxId ?? fromHost ?? null,
    apiBase: (cfg?.apiBase ?? 'https://api.crux.garden').replace(/\/$/, ''),
  };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(
  url: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const res = await fetch(url, { ...init, headers });
  const data = parseJson(await res.text());
  if (!res.ok) {
    const msg =
      (data as { message?: string | string[] } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(Array.isArray(msg) ? msg.join('; ') : String(msg), res.status);
  }
  return data as T;
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function board(cfg: SiteConfig, day = 'today'): Promise<Leaderboard | null> {
  if (!cfg.cruxId) return null;
  const data = await call<Leaderboard>(
    `${cfg.apiBase}/cruxes/${encodeURIComponent(cfg.cruxId)}/leaderboard/${encodeURIComponent(day)}`,
  );
  return normalizeBoard(data);
}

export async function postScore(
  cfg: SiteConfig,
  token: string,
  body: PostScoreBody,
  day = 'today',
): Promise<Leaderboard | null> {
  if (!cfg.cruxId) return null;
  const payload: PostScoreBody = {
    score: clampInt(body.score, 0, 10),
    seconds: clampInt(body.seconds, 0, 330),
  };
  const data = await call<Leaderboard>(
    `${cfg.apiBase}/cruxes/${encodeURIComponent(cfg.cruxId)}/leaderboard/${encodeURIComponent(day)}`,
    { method: 'POST', body: JSON.stringify(payload), token },
  );
  return normalizeBoard(data);
}

export async function requestCode(cfg: SiteConfig, email: string): Promise<void> {
  await call(`${cfg.apiBase}/auth/code`, { method: 'POST', body: JSON.stringify({ email }) });
}

export async function login(
  cfg: SiteConfig,
  email: string,
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const data = await call<{ accessToken?: string; refreshToken?: string }>(
    `${cfg.apiBase}/auth/login`,
    { method: 'POST', body: JSON.stringify({ email, code }) },
  );
  if (!data?.accessToken) throw new ApiError('No token came back.', 500);
  return { accessToken: data.accessToken, refreshToken: data.refreshToken ?? '' };
}

/** A board as the API sent it, with anything malformed dropped. */
export function normalizeBoard(raw: unknown): Leaderboard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const entries = Array.isArray(r.entries)
    ? r.entries
        .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
        .map((e) => ({
          name: String(e.name ?? ''),
          score: Number(e.score ?? 0),
          seconds: Number(e.seconds ?? 0),
          at: String(e.at ?? ''),
        }))
    : [];
  const y = r.you as Record<string, unknown> | null | undefined;
  const you: LeaderboardYou | null =
    y && typeof y === 'object' && Number.isFinite(Number(y.rank))
      ? {
          rank: Number(y.rank),
          score: Number(y.score ?? 0),
          seconds: Number(y.seconds ?? 0),
          counted: y.counted !== false,
        }
      : null;
  return { day: String(r.day ?? ''), entries, you };
}

/** 1:14 — seconds as the board shows them. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
