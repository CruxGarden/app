/**
 * A Round of 5Ws — the game as configuration on the interrogable
 * primitive (ADR 0016). Pure reducers over `RoundState`; the UI drives the
 * clock by calling `tick` and the model calls by pairing `ask`/`guess` with
 * `receiveAnswer`/`receiveVerdict`. No timers, no I/O, no React here.
 *
 * Almost every rule exists to make the round *feel* a certain way — Wordle is
 * the shape. Each reducer names the feeling it serves.
 */

import type { Adjudication, Exchange, HiddenState } from './hidden';

export type RoundStatus = 'open' | 'won' | 'lost' | 'gaveUp' | 'timeUp';

/** What the round is waiting on from the model — the clock is paused while this is set. */
export type Awaiting = 'opening' | 'answer' | 'verdict' | null;

export interface Turn {
  question: string;
  /** null while the voice is composing. */
  answer: string | null;
  /** Elapsed round time when the question was asked (ms). */
  atMs: number;
}

export interface Guess {
  text: string;
  /** null while the adjudicator is composing. */
  correct: boolean | null;
  normalized?: string;
  why?: string;
  atMs: number;
}

/** A page the player chose to keep from the in-round browser — one at a time, deliberately. */
export interface KeptPage {
  url: string;
  title?: string;
}

export interface RoundConfig {
  /** Points to start with. Default 10. */
  points: number;
  /** Free questions. Default 10. */
  questions: number;
  /** The whole round's clock, spent however the player likes. Default 300 000 (five minutes). */
  budgetMs: number;
}

export const DEFAULT_ROUND_CONFIG: Readonly<RoundConfig> = {
  points: 10,
  questions: 10,
  budgetMs: 300_000,
};

export interface RoundState {
  /** The hidden thing, fixed for the round and passed into every model call. */
  entry: HiddenState;
  /** The Shelf this round draws from (its id) — for the transcript. */
  shelfId: string;
  config: RoundConfig;
  points: number;
  questionsLeft: number;
  budgetMs: number;
  elapsedMs: number;
  /** The model is composing — the clock is paused; nothing else can be asked. */
  composing: boolean;
  awaiting: Awaiting;
  /** The line the voice is already saying when the round opens. */
  openingLine: string | null;
  turns: Turn[];
  guesses: Guess[];
  status: RoundStatus;
  /** The in-round browser is showing a page. The clock keeps running. */
  browserOpen: boolean;
  keptPages: KeptPage[];
  /** ISO timestamp the round opened. */
  startedAt: string;
  /** Elapsed round time when the round ended (ms), for the transcript's duration. */
  endedAtMs: number | null;
}

// ── Opening ─────────────────────────────────────────────────────────────────

/**
 * Open a round. The voice is already talking when you open it: the state
 * starts *composing* the opening line, so there is no setup screen and no
 * dead first second on the clock. Ten points, ten free questions, five
 * minutes.
 */
export function startRound(
  entry: HiddenState,
  opts: { shelfId?: string; startedAt?: string } & Partial<RoundConfig> = {},
): RoundState {
  const config: RoundConfig = {
    points: opts.points ?? DEFAULT_ROUND_CONFIG.points,
    questions: opts.questions ?? DEFAULT_ROUND_CONFIG.questions,
    budgetMs: opts.budgetMs ?? DEFAULT_ROUND_CONFIG.budgetMs,
  };
  return {
    entry,
    shelfId: opts.shelfId ?? '',
    config,
    points: config.points,
    questionsLeft: config.questions,
    budgetMs: config.budgetMs,
    elapsedMs: 0,
    composing: true,
    awaiting: 'opening',
    openingLine: null,
    turns: [],
    guesses: [],
    status: 'open',
    browserOpen: false,
    keptPages: [],
    startedAt: opts.startedAt ?? new Date().toISOString(),
    endedAtMs: null,
  };
}

/** The opening line arrived: the voice has spoken, the clock may run. */
export function receiveOpening(state: RoundState, text: string): RoundState {
  if (state.awaiting !== 'opening') return state;
  return { ...state, openingLine: text.trim(), composing: false, awaiting: null };
}

// ── Questions ───────────────────────────────────────────────────────────────

/**
 * Ask a question. Questions are free — they cost nothing but one of the ten
 * — so asking is never a risk; the player should feel free to be curious.
 * Refused (state unchanged) while the model is composing, when the ten are
 * spent, or after the round has ended.
 */
export function ask(state: RoundState, question: string): RoundState {
  const q = question.trim();
  if (state.status !== 'open' || state.composing || state.questionsLeft <= 0 || !q) return state;
  return {
    ...state,
    questionsLeft: state.questionsLeft - 1,
    composing: true,
    awaiting: 'answer',
    turns: [...state.turns, { question: q, answer: null, atMs: state.elapsedMs }],
  };
}

/** The voice answered. The clock resumes. */
export function receiveAnswer(state: RoundState, text: string): RoundState {
  if (state.awaiting !== 'answer') return state;
  const turns = [...state.turns];
  const last = turns[turns.length - 1];
  if (last && last.answer === null) turns[turns.length - 1] = { ...last, answer: text.trim() };
  return { ...state, turns, composing: false, awaiting: null };
}

/**
 * The model failed to answer (network, key, provider). The question is
 * handed back: never charge the player for latency, and never for someone
 * else's outage either.
 */
export function withdrawAsk(state: RoundState): RoundState {
  if (state.awaiting !== 'answer') return state;
  const turns = state.turns.slice(0, -1);
  return {
    ...state,
    turns,
    questionsLeft: Math.min(state.config.questions, state.questionsLeft + 1),
    composing: false,
    awaiting: null,
  };
}

// ── Guesses ─────────────────────────────────────────────────────────────────

/**
 * Guess. Guesses are the only thing that costs points, so a guess should feel
 * like a small wager — worth a beat of hesitation, never a catastrophe.
 * Refused while composing or after the round has ended. Guesses are not
 * limited in number: the points are the limit.
 */
export function guess(state: RoundState, text: string): RoundState {
  const g = text.trim();
  if (state.status !== 'open' || state.composing || !g) return state;
  return {
    ...state,
    composing: true,
    awaiting: 'verdict',
    guesses: [...state.guesses, { text: g, correct: null, atMs: state.elapsedMs }],
  };
}

/**
 * The adjudicator's verdict. A wrong guess costs one point (floor 0). The
 * right guess costs nothing — a first-try hit is a clean 10 — and ends the
 * round as a win. Reaching 0 ends the round as lost: there is nothing left
 * to spend, and the reveal is the reward, so give it now rather than let the
 * player grind at zero.
 */
export function receiveVerdict(state: RoundState, verdict: Adjudication): RoundState {
  if (state.awaiting !== 'verdict') return state;
  const guesses = [...state.guesses];
  const i = guesses.length - 1;
  const last = guesses[i];
  if (last) {
    guesses[i] = {
      ...last,
      correct: verdict.correct,
      normalized: verdict.normalized,
      why: verdict.why,
    };
  }
  const base = { ...state, guesses, composing: false, awaiting: null as Awaiting };
  if (verdict.correct) return end(base, 'won');
  const points = Math.max(0, state.points - 1);
  if (points === 0) return end({ ...base, points }, 'lost');
  return { ...base, points };
}

/** The adjudicator failed. The guess is handed back, uncharged. */
export function withdrawGuess(state: RoundState): RoundState {
  if (state.awaiting !== 'verdict') return state;
  return { ...state, guesses: state.guesses.slice(0, -1), composing: false, awaiting: null };
}

// ── The clock ───────────────────────────────────────────────────────────────

/**
 * Advance the clock. Five minutes for the whole round, spent however the
 * player likes — not a per-question countdown, so nobody feels rushed on a
 * single question. Paused while the model composes: the player is never
 * charged for latency. Not paused while the browser is open: searching costs
 * seconds, and that is its whole price. Reaching the budget ends the round.
 */
export function tick(state: RoundState, ms: number): RoundState {
  if (state.status !== 'open' || state.composing || ms <= 0) return state;
  const elapsedMs = Math.min(state.budgetMs, state.elapsedMs + ms);
  const next = { ...state, elapsedMs };
  return elapsedMs >= state.budgetMs ? end(next, 'timeUp') : next;
}

export function remainingMs(state: RoundState): number {
  return Math.max(0, state.budgetMs - state.elapsedMs);
}

// ── The browser ─────────────────────────────────────────────────────────────

/**
 * Open the in-round browser. Same surface, same clock: the clock does NOT
 * pause. Three actions, three currencies — questions cost nothing, searches
 * cost seconds, guesses cost points.
 */
export function openBrowser(state: RoundState): RoundState {
  if (state.status !== 'open' || state.browserOpen) return state;
  return { ...state, browserOpen: true };
}

export function closeBrowser(state: RoundState): RoundState {
  if (!state.browserOpen) return state;
  return { ...state, browserOpen: false };
}

/**
 * Keep a page from the browser — deliberately, one at a time. Kept pages
 * ride into the transcript; nothing is captured automatically.
 */
export function keepPage(state: RoundState, page: KeptPage): RoundState {
  const url = page.url.trim();
  if (!url || state.keptPages.some((p) => p.url === url)) return state;
  return {
    ...state,
    keptPages: [
      ...state.keptPages,
      { url, ...(page.title?.trim() ? { title: page.title.trim() } : {}) },
    ],
  };
}

// ── Ending ──────────────────────────────────────────────────────────────────

/**
 * Give up. Losing is fine — a shrug and another round. Allowed even while
 * the model is composing (the pending answer is moot), never after the round
 * has already ended. The reveal follows.
 */
export function giveUp(state: RoundState): RoundState {
  if (state.status !== 'open') return state;
  return end({ ...state, composing: false, awaiting: null }, 'gaveUp');
}

function end(state: RoundState, status: Exclude<RoundStatus, 'open'>): RoundState {
  return { ...state, status, endedAtMs: state.elapsedMs, browserOpen: false };
}

export function isOver(state: RoundState): boolean {
  return state.status !== 'open';
}

/** Score: the points left on a win, 0 otherwise. Silence where other products put praise. */
export function scoreOf(state: RoundState): number {
  return state.status === 'won' ? state.points : 0;
}

/** The answered exchanges so far — what every model call is given as context. */
export function exchangesOf(state: Pick<RoundState, 'turns'>): Exchange[] {
  return state.turns
    .filter((t): t is Turn & { answer: string } => typeof t.answer === 'string')
    .map((t) => ({ question: t.question, answer: t.answer }));
}

/** Wrong guesses, in order — the reveal's curriculum. */
export function missesOf(state: Pick<RoundState, 'guesses'>): string[] {
  return state.guesses.filter((g) => g.correct === false).map((g) => g.text);
}

/** Duration in whole seconds, for the transcript. */
export function durationSeconds(state: RoundState): number {
  return Math.round((state.endedAtMs ?? state.elapsedMs) / 1000);
}
