import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TYPING,
  typeOut,
  typingDelays,
  typingDuration,
  typingUnits,
} from './src/lib/typing';
import { decryptSchedule, letterCount, maskName, splitWho } from './src/lib/decrypt';

/**
 * The voice types: a typist's pace, a breath after punctuation, a skip that
 * finishes at once. Pure — the schedule is numbers, the driver runs on
 * injected timers.
 */
describe('typing pacer', () => {
  it('steps by code point at 34 characters a second by default', () => {
    expect(typingUnits('a—b')).toEqual(['a', '—', 'b']);
    const text = 'x'.repeat(69); // 68 intervals
    const delays = typingDelays(text);
    expect(delays[0]).toBe(0);
    expect(new Set(delays.slice(1))).toEqual(new Set([Math.round(1000 / 34)]));
    expect(typingDuration(text)).toBeGreaterThanOrEqual(1900);
    expect(typingDuration(text)).toBeLessThanOrEqual(2100);
    expect(DEFAULT_TYPING.charsPerSecond).toBeGreaterThanOrEqual(28);
    expect(DEFAULT_TYPING.charsPerSecond).toBeLessThanOrEqual(40);
  });

  it('pauses after a sentence and after a clause, only where a space follows', () => {
    const base = Math.round(1000 / DEFAULT_TYPING.charsPerSecond);
    const d = typingDelays('Sit. Down, now. 3.5 ok');
    const units = typingUnits('Sit. Down, now. 3.5 ok');
    const at = (i: number) => d[i]!;
    expect(at(units.indexOf(' '))).toBe(base + DEFAULT_TYPING.sentencePauseMs); // after "Sit."
    const comma = units.indexOf(',');
    expect(at(comma + 1)).toBe(base + DEFAULT_TYPING.clausePauseMs); // after "Down,"
    const dot35 = units.indexOf('3') + 1;
    expect(at(dot35 + 1)).toBe(base); // "3.5": no pause inside a number
    expect(DEFAULT_TYPING.sentencePauseMs).toBeGreaterThanOrEqual(120);
    expect(DEFAULT_TYPING.sentencePauseMs).toBeLessThanOrEqual(250);
    expect(DEFAULT_TYPING.clausePauseMs).toBeGreaterThanOrEqual(120);
    expect(typingDelays('a\nb')[2]).toBe(base + DEFAULT_TYPING.sentencePauseMs);
    expect(typingDelays('')).toEqual([]);
  });

  it('respects a custom speed', () => {
    expect(typingDelays('abc', { charsPerSecond: 10 })).toEqual([0, 100, 100]);
  });
});

/** Hand-driven timers: every scheduled step is run by `flush`. */
function timers() {
  const queue: Array<{ id: number; fn: () => void; ms: number }> = [];
  let next = 1;
  return {
    setTimeout: (fn: () => void, ms: number) => {
      const id = next++;
      queue.push({ id, fn, ms });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = queue.findIndex((q) => q.id === h);
      if (i >= 0) queue.splice(i, 1);
    },
    /** Run the next scheduled step; returns its delay, or null when nothing is queued. */
    step(): number | null {
      const q = queue.shift();
      if (!q) return null;
      q.fn();
      return q.ms;
    },
    pending: () => queue.length,
  };
}

describe('typeOut', () => {
  it('shows one more unit per step, then fires onDone once', () => {
    const t = timers();
    const shown: number[] = [];
    let done = 0;
    typeOut('Go.', { ...t, onProgress: (n) => shown.push(n), onDone: () => done++ });
    expect(t.step()).toBe(0); // the first unit at once
    expect(shown).toEqual([1]);
    expect(t.step()).toBe(Math.round(1000 / 34));
    expect(t.step()).toBe(Math.round(1000 / 34));
    expect(shown).toEqual([1, 2, 3]);
    expect(done).toBe(1);
    expect(t.pending()).toBe(0);
  });

  it('skip shows everything at once and stops the timers; a second skip is a no-op', () => {
    const t = timers();
    const shown: number[] = [];
    let done = 0;
    const typer = typeOut('A line of some length.', {
      ...t,
      onProgress: (n) => shown.push(n),
      onDone: () => done++,
    });
    t.step();
    t.step();
    expect(shown).toEqual([1, 2]);
    typer.skip();
    expect(shown).toEqual([1, 2, 22]);
    expect(done).toBe(1);
    expect(t.pending()).toBe(0);
    typer.skip();
    expect(done).toBe(1);
  });

  it('cancel stops without finishing', () => {
    const t = timers();
    let done = 0;
    const typer = typeOut('abc', { ...t, onProgress: () => {}, onDone: () => done++ });
    t.step();
    typer.cancel();
    expect(t.pending()).toBe(0);
    expect(done).toBe(0);
    typer.skip();
    expect(done).toBe(0);
  });

  it('an empty line is done on the first step', () => {
    const t = timers();
    let done = 0;
    typeOut('', { ...t, onProgress: () => {}, onDone: () => done++ });
    t.step();
    expect(done).toBe(1);
  });
});

describe('decrypt', () => {
  it('masks the letters and keeps the spaces', () => {
    expect(maskName('Emmy Noether', 0)).toBe('▮▮▮▮ ▮▮▮▮▮▮▮');
    expect(maskName('Emmy Noether', 5)).toBe('Emmy N▮▮▮▮▮▮');
    expect(maskName('Emmy Noether', 99)).toBe('Emmy Noether');
    expect(letterCount('Emmy Noether')).toBe(11);
  });

  it('spreads the resolve across the duration, the first letter carrying the delay', () => {
    expect(decryptSchedule(4, 1200)).toEqual([300, 300, 300, 300]);
    expect(decryptSchedule(4, 1200, 500)).toEqual([800, 300, 300, 300]);
    expect(decryptSchedule(0, 1200)).toEqual([]);
  });

  it('finds the name inside the reveal line, or takes the rest of "This was"', () => {
    expect(splitWho('This was Hypatia of Alexandria, c. 355–415.', 'Hypatia')).toEqual({
      before: 'This was ',
      name: 'Hypatia',
      after: ' of Alexandria, c. 355–415.',
    });
    expect(splitWho('This was the Aral Sea.', 'Aral Sea')).toEqual({
      before: 'This was the ',
      name: 'Aral Sea',
      after: '.',
    });
    expect(splitWho('This was a lighthouse keeper.', 'Voyager 1')).toEqual({
      before: 'This was ',
      name: 'a lighthouse keeper',
      after: '.',
    });
    expect(splitWho('Nobody you know.', 'Voyager 1')).toEqual({
      before: '',
      name: 'Nobody you know.',
      after: '',
    });
  });
});
