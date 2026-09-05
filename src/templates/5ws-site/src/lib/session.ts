/**
 * One Round, driven: the pure reducers in `../game/round` plus the four model
 * calls in `../game/prompts`, a 250 ms clock, and the reveal at the end. No
 * React here — the island subscribes and renders. Testable with any
 * LanguageModel (the app's scripted mock in vitest).
 *
 * The rules that make it feel right live in the reducers; this file only
 * sequences them: the voice is already composing when the session opens,
 * the clock is advanced by wall-clock deltas the reducer ignores while
 * composing (latency is never charged), a model failure hands the question
 * or guess back uncharged with a sentence and a way to retry, and any end
 * state runs the reveal — which never blocks (the engine falls back to the
 * shelf's own facts).
 */

import type { LanguageModel } from 'ai';
import {
  ask,
  closeBrowser,
  giveUp,
  guess,
  isOver,
  keepPage,
  openBrowser,
  receiveAnswer,
  receiveOpening,
  receiveVerdict,
  startRound,
  tick,
  withdrawAsk,
  withdrawGuess,
  exchangesOf,
  type KeptPage,
  type RoundState,
} from '../game/round';
import { adjudicate, answer, openingLine, reveal, type CallContext } from '../game/prompts';
import {
  disclosureFor,
  voiceFor,
  type DisclosureRule,
  type HiddenState,
  type Reveal,
  type Voice,
} from '../game/hidden';

export type SessionPhase = 'playing' | 'revealing' | 'done';

export interface Retry {
  kind: 'ask' | 'guess';
  text: string;
}

export interface SessionSnapshot {
  state: RoundState;
  phase: SessionPhase;
  reveal: Reveal | null;
  /** A model failure, in plain words. Cleared by the next successful call. */
  error: string | null;
  /** What to re-issue when the visitor asks to try again. */
  retry: Retry | null;
}

export interface SessionOptions {
  entry: HiddenState;
  shelfId: string;
  model: LanguageModel;
  temperature?: CallContext['temperature'];
  voice?: Partial<Voice>;
  disclosure?: Partial<DisclosureRule>;
  /** Injectable for tests. */
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /** Clock resolution. Default 250 ms. */
  tickMs?: number;
}

type Listener = (snap: SessionSnapshot) => void;

export class RoundSession {
  private snap: SessionSnapshot;
  private readonly listeners = new Set<Listener>();
  private readonly ctx: CallContext;
  private readonly voice: Voice;
  private readonly disclosure: DisclosureRule;
  private readonly abort = new AbortController();
  private readonly now: () => number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly tickMs: number;
  private clock: unknown = null;
  private lastTickAt = 0;
  private disposed = false;

  constructor(opts: SessionOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.setIntervalFn = opts.setInterval ?? ((fn, ms) => setInterval(fn, ms));
    this.clearIntervalFn = opts.clearInterval ?? ((h) => clearInterval(h as number));
    this.tickMs = opts.tickMs ?? 250;
    this.ctx = {
      model: opts.model,
      signal: this.abort.signal,
      ...(opts.temperature ? { temperature: opts.temperature } : {}),
    };
    this.voice = voiceFor(opts.entry, opts.voice);
    this.disclosure = disclosureFor(opts.disclosure);
    this.snap = {
      state: startRound(opts.entry, { shelfId: opts.shelfId }),
      phase: 'playing',
      reveal: null,
      error: null,
      retry: null,
    };
  }

  get(): SessionSnapshot {
    return this.snap;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Open the round: the voice starts composing its first line; the clock starts with it. */
  start(): void {
    this.lastTickAt = this.now();
    this.clock = this.setIntervalFn(() => this.onTick(), this.tickMs);
    void this.compose(
      () => openingLine(this.ctx, this.snap.state.entry, this.voice, this.disclosure),
      (line) => receiveOpening(this.snap.state, line),
      // The opening never fails the round: the voice says nothing, the clock runs,
      // and the error line tells the visitor what the provider said.
      () => receiveOpening(this.snap.state, ''),
      null,
    );
  }

  ask(question: string): void {
    const before = this.snap.state;
    const next = ask(before, question);
    if (next === before) return;
    this.set({ state: next, error: null, retry: null });
    void this.compose(
      () =>
        answer(
          this.ctx,
          next.entry,
          this.voice,
          this.disclosure,
          exchangesOf(before),
          question.trim(),
        ),
      (text) => receiveAnswer(this.snap.state, text),
      () => withdrawAsk(this.snap.state),
      { kind: 'ask', text: question.trim() },
    );
  }

  guess(text: string): void {
    const before = this.snap.state;
    const next = guess(before, text);
    if (next === before) return;
    this.set({ state: next, error: null, retry: null });
    void this.compose(
      () => adjudicate(this.ctx, next.entry, text.trim(), exchangesOf(before)),
      (verdict) => receiveVerdict(this.snap.state, verdict),
      () => withdrawGuess(this.snap.state),
      { kind: 'guess', text: text.trim() },
    );
  }

  /** Re-issue the question or guess the model failed on. */
  retry(): void {
    const r = this.snap.retry;
    if (!r) return;
    if (r.kind === 'ask') this.ask(r.text);
    else this.guess(r.text);
  }

  openBrowser(): void {
    this.set({ state: openBrowser(this.snap.state) });
  }

  closeBrowser(): void {
    this.set({ state: closeBrowser(this.snap.state) });
  }

  keepPage(page: KeptPage): void {
    this.set({ state: keepPage(this.snap.state, page) });
  }

  giveUp(): void {
    const next = giveUp(this.snap.state);
    if (next === this.snap.state) return;
    this.set({ state: next, error: null, retry: null });
    this.finishIfOver();
  }

  dispose(): void {
    this.disposed = true;
    this.abort.abort();
    if (this.clock !== null) this.clearIntervalFn(this.clock);
    this.clock = null;
    this.listeners.clear();
  }

  // ── internals ──

  private set(patch: Partial<SessionSnapshot>): void {
    if (this.disposed) return;
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn(this.snap);
  }

  private onTick(): void {
    const t = this.now();
    const delta = t - this.lastTickAt;
    this.lastTickAt = t;
    const next = tick(this.snap.state, delta); // ignored while composing or once over
    if (next !== this.snap.state) {
      this.set({ state: next });
      this.finishIfOver();
    }
  }

  /**
   * One model call: on success apply the reducer; on failure hand the move
   * back (uncharged) with the message and a retry. Late results after the
   * round ended are dropped by the reducers themselves (`awaiting` is null).
   */
  private async compose<T>(
    call: () => Promise<T>,
    apply: (result: T) => RoundState,
    withdraw: () => RoundState,
    retry: Retry | null,
  ): Promise<void> {
    try {
      const result = await call();
      if (this.disposed) return;
      this.set({ state: apply(result) });
    } catch (err) {
      if (this.disposed || this.abort.signal.aborted) return;
      this.set({ state: withdraw(), error: messageOf(err), retry });
    }
    this.finishIfOver();
  }

  private finishIfOver(): void {
    if (this.snap.phase !== 'playing' || !isOver(this.snap.state)) return;
    if (this.clock !== null) this.clearIntervalFn(this.clock);
    this.clock = null;
    this.set({ phase: 'revealing' });
    const s = this.snap.state;
    void reveal(this.ctx, s.entry, exchangesOf(s), s.guesses, this.voice)
      .catch(() => null)
      .then((r) => {
        if (this.disposed) return;
        // `reveal` falls back to the shelf's own facts internally; null only on abort.
        this.set({ phase: 'done', reveal: r });
      });
  }
}

/** One sentence for a failed call — the provider's words where it has any. */
export function messageOf(err: unknown): string {
  const raw = (err as { message?: string } | null)?.message?.trim() || 'The model did not answer.';
  const line = raw.split('\n')[0]!.slice(0, 200);
  return /[.!?]$/.test(line) ? line : `${line}.`;
}
