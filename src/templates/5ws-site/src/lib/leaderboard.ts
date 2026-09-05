/**
 * Today's board, "played today", and the email-code sign-in that lets a
 * visitor join the board.
 *
 * One day, one figure, one counted round per player: the first round of a
 * UTC day on a shelf is the daily and may be posted; the rest is practice.
 * Both records live in the crux's own Crux Store (`./store`) — no other
 * backend; a fork of this site carries its own board:
 *
 *   leaderboard:<YYYY-MM-DD>   public     { entries: [{ name, score, seconds, at }] }
 *   played:<YYYY-MM-DD>        protected  { entry, shelf, score, seconds }
 *
 * `public` means the day's board is one value belonging to the crux: anyone
 * reads it, and writing — like every store write — needs a visitor's sign-in.
 * The page maintains it —
 * read, replace-or-add the visitor's entry, sort, cap, write back — under a
 * convention the store does not enforce: **one entry per name, the name being
 * the signed-in account's username, posted only by that account.** A
 * signed-in visitor could break that with their own code; the board is a
 * scoreboard among people who care, not a ledger. `played` is private to the
 * visitor and is what makes the second round of a day practice on any of
 * their browsers (signed out, the browser's own `5ws:daily:*` record stands
 * in — see `./local-state`).
 *
 * Sign-in is the API's email-code flow (`POST /auth/code`, `POST /auth/login`,
 * then `GET /auth/profile` for the username); the token then rides on store
 * writes (`./store`). Plain `fetch`, no dependency — this file is written into
 * the published site.
 */

import { utcDay } from './local-state';
import type { KeyStore } from './store';

export interface LeaderboardEntry {
  name: string;
  score: number;
  seconds: number;
  /** ISO timestamp the score was posted. */
  at: string;
}

export interface Leaderboard {
  /** YYYY-MM-DD, UTC. */
  day: string;
  /** Best first: score desc, then seconds asc, then earliest post. At most `BOARD_CAP`. */
  entries: LeaderboardEntry[];
}

/** What one daily round posts to the board. */
export interface Score {
  score: number;
  seconds: number;
}

/** The private record that today's figure has been played (one counted round a day). */
export interface Played extends Score {
  entry: string;
  shelf: string;
}

export const boardKey = (day: string) => `leaderboard:${day}`;
export const playedKey = (day: string) => `played:${day}`;

/** The UTC day `daysAgo` days before today, YYYY-MM-DD. */
export function utcDayAgo(daysAgo: number, now: Date = new Date()): string {
  return utcDay(new Date(now.getTime() - daysAgo * 86_400_000));
}

// ── The board ───────────────────────────────────────────────────────────────

/** The most a day keeps. The shelf page shows 20, the reveal 10. */
export const BOARD_CAP = 50;

/** The day's board, or an empty one. Never throws — an unreadable board is an empty board. */
export async function readBoard(store: KeyStore, day: string): Promise<Leaderboard> {
  try {
    return normalizeBoard(await store.get(boardKey(day)), day);
  } catch {
    return { day, entries: [] };
  }
}

/**
 * Post a daily score under `name` — the signed-in account's username; the
 * caller has made sure of the sign-in. Read, replace-or-add this name's entry,
 * sort, cap, write back (the write needs the token in the store).
 *
 * The page showed the board at the reveal, then the visitor signed in; this
 * reads it again, immediately before the write, so posts that landed in
 * between are kept. Two visitors writing in the same moment can still cross —
 * both read, both write, the second write wins and the first entry is lost
 * until its owner plays again tomorrow. The rare lost write is accepted
 * rather than adding a backend to prevent it. Throws (`StoreError`) when the
 * store refuses.
 */
export async function postScore(
  store: KeyStore,
  day: string,
  name: string,
  score: Score,
): Promise<Leaderboard> {
  const entry: LeaderboardEntry = { name, ...clampScore(score), at: new Date().toISOString() };
  const board = withEntry(await readBoard(store, day), entry);
  await store.set(boardKey(day), { entries: board.entries }, 'public');
  return board;
}

/** The board with `entry` in place of any entry of the same name, sorted and capped. */
export function withEntry(board: Leaderboard, entry: LeaderboardEntry): Leaderboard {
  const rest = board.entries.filter((e) => e.name !== entry.name);
  return { day: board.day, entries: sortEntries([...rest, entry]).slice(0, BOARD_CAP) };
}

/** 1-based rank of `name` on the board, or null when it is not there. */
export function rankOf(board: Leaderboard, name: string): number | null {
  const i = board.entries.findIndex((e) => e.name === name);
  return i < 0 ? null : i + 1;
}

/** The visitor's "played today" record, or null when they have not (or are signed out). */
export async function readPlayed(store: KeyStore, day: string): Promise<Played | null> {
  try {
    const raw = await store.get(playedKey(day));
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    return {
      entry: String(r.entry ?? ''),
      shelf: String(r.shelf ?? ''),
      score: Number(r.score ?? 0),
      seconds: Number(r.seconds ?? 0),
    };
  } catch {
    return null;
  }
}

export async function markPlayed(store: KeyStore, day: string, played: Played): Promise<void> {
  await store.set(playedKey(day), { ...played, ...clampScore(played) }, 'protected');
}

/** A board as the store holds it — `{ entries: [{ name, score, seconds, at }] }` — sorted, capped, anything malformed dropped. */
export function normalizeBoard(raw: unknown, day: string): Leaderboard {
  if (!raw || typeof raw !== 'object') return { day, entries: [] };
  const r = raw as Record<string, unknown>;
  const entries = (Array.isArray(r.entries) ? r.entries : [])
    .map(toEntry)
    .filter((e): e is LeaderboardEntry => e !== null);
  return { day, entries: sortEntries(entries).slice(0, BOARD_CAP) };
}

/** Score desc, seconds asc, earliest post first. */
export function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort(compareEntries);
}

function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return b.score - a.score || a.seconds - b.seconds || a.at.localeCompare(b.at);
}

function toEntry(raw: unknown): LeaderboardEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const name = typeof e.name === 'string' ? e.name.trim() : '';
  const score = Number(e.score);
  const seconds = Number(e.seconds);
  if (!name || !Number.isFinite(score) || !Number.isFinite(seconds)) return null;
  return { name, score, seconds, at: String(e.at ?? '') };
}

// ── Sign-in ─────────────────────────────────────────────────────────────────

export interface SiteConfig {
  /** The crux this site is; null when the page cannot tell (a local preview). */
  cruxId: string | null;
  /** Where the sign-in calls go. */
  apiBase: string;
}

/**
 * Where this site was published from. A published page learns both from the
 * publish injection (`window.crux.publish`); failing that, its
 * `{cruxId}.publish.*` hostname; a preview has neither, and the sign-in
 * still knows the API by its public address.
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

/** The signed-in account's username — the name a score is posted under. */
export async function profile(cfg: SiteConfig, token: string): Promise<{ username: string }> {
  const data = await call<{ author?: { username?: string } | null }>(
    `${cfg.apiBase}/auth/profile`,
    {
      token,
    },
  );
  const username = data?.author?.username?.trim();
  if (!username) throw new ApiError('This account has no username yet.', 500);
  return { username };
}

// ── Display ─────────────────────────────────────────────────────────────────

/** 1:14 — seconds as the board shows them. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A score as the board will take it: 0–10 points, 0–330 seconds, whole numbers. */
export function clampScore(score: Score): Score {
  return { score: clampInt(score.score, 0, 10), seconds: clampInt(score.seconds, 0, 330) };
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
