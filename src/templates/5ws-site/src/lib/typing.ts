/**
 * The voice types. The model answers in whole lines (that call is unchanged);
 * this is the client's cadence for showing one — character by character at a
 * typist's pace, a breath after punctuation, and a way to skip to the end.
 *
 * Pure: a schedule of delays over a finished string, and a small driver that
 * walks it on injectable timers so tests never wait. Under reduced motion the
 * surface shows the text at once and never calls this.
 */

export interface TypingOptions {
  /** Characters per second. 28–40 reads as a confident typist; default 34. */
  charsPerSecond?: number;
  /** Extra pause after a sentence ends (. ! ? …) and a space or the end follows. Default 220 ms. */
  sentencePauseMs?: number;
  /** Extra pause after a clause mark (, ; : — –) followed by a space. Default 120 ms. */
  clausePauseMs?: number;
}

export const DEFAULT_TYPING: Required<TypingOptions> = {
  charsPerSecond: 34,
  sentencePauseMs: 220,
  clausePauseMs: 120,
};

const SENTENCE_END = /[.!?…]/;
const CLAUSE_MARK = /[,;:—–]/;

/** The units the text is shown in — code points, so an em dash or a curly quote is one step. */
export function typingUnits(text: string): string[] {
  return Array.from(text);
}

/**
 * Delay, in ms, before unit `i` appears. Unit 0 appears at once; every later
 * unit waits the base interval, plus a pause when the unit before it closed a
 * sentence or a clause and this one is the space (or line break) after it —
 * so "3.5" does not pause and "Sit. Down." does.
 */
export function typingDelays(text: string, options: TypingOptions = {}): number[] {
  const o = { ...DEFAULT_TYPING, ...options };
  const units = typingUnits(text);
  const base = 1000 / o.charsPerSecond;
  return units.map((unit, i) => {
    if (i === 0) return 0;
    const prev = units[i - 1]!;
    let delay = base;
    if (/\s/.test(unit)) {
      if (SENTENCE_END.test(prev)) delay += o.sentencePauseMs;
      else if (CLAUSE_MARK.test(prev)) delay += o.clausePauseMs;
    }
    if (prev === '\n') delay += o.sentencePauseMs;
    return Math.round(delay);
  });
}

/** How long the whole line takes to type, in ms. */
export function typingDuration(text: string, options: TypingOptions = {}): number {
  return typingDelays(text, options).reduce((a, b) => a + b, 0);
}

export interface Typer {
  /** Show the rest at once. `onDone` fires once; nothing after that. */
  skip(): void;
  /** Stop without finishing (the surface went away). Nothing fires. */
  cancel(): void;
}

export interface TypeOutOptions extends TypingOptions {
  /** `shown` units of the text are visible now. Called for every unit, first at 1. */
  onProgress: (shown: number) => void;
  onDone?: () => void;
  /** Injectable for tests. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/** Walk the schedule. Returns the handle that skips or cancels it. */
export function typeOut(text: string, options: TypeOutOptions): Typer {
  const delays = typingDelays(text, options);
  const total = delays.length;
  const schedule = options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelTimer = options.clearTimeout ?? ((h) => clearTimeout(h as number));
  let shown = 0;
  let handle: unknown = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (handle !== null) cancelTimer(handle);
    handle = null;
    options.onDone?.();
  };
  const step = () => {
    handle = null;
    if (finished) return;
    shown += 1;
    options.onProgress(shown);
    if (shown >= total) {
      finish();
      return;
    }
    handle = schedule(step, delays[shown]!);
  };

  if (total === 0) {
    // An empty line: done as soon as the caller can hear it
    handle = schedule(finish, 0);
  } else {
    handle = schedule(step, 0);
  }

  return {
    skip() {
      if (finished) return;
      if (shown < total) {
        shown = total;
        options.onProgress(shown);
      }
      finish();
    },
    cancel() {
      finished = true;
      if (handle !== null) cancelTimer(handle);
      handle = null;
    },
  };
}
