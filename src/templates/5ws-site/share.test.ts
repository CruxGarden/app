import { describe, it, expect } from 'vitest';
import { shareGlyphs, shareResult } from './src/lib/share';
import { formatCountdown, msUntilUtcMidnight } from './src/lib/countdown';
import { clockParts, pad2 } from './src/lib/format';

/** Wordle's engine: a block with no spoiler in it. */
describe('share result', () => {
  const base = {
    name: 'The Game',
    question: 'Who am I?',
    total: 10,
    url: 'https://example.test/play/',
  };
  const guesses = (...c: boolean[]) => c.map((correct) => ({ correct }));

  it('a won daily: score, time, one glyph per guess, the link — never the name', () => {
    const block = shareResult({
      ...base,
      day: '2026-09-05',
      status: 'won',
      score: 8,
      seconds: 192,
      guesses: [...guesses(false, false), { correct: null }, { correct: true }],
    });
    expect(block).toBe(
      'The Game · Who am I? · 2026-09-05\n8/10 in 3:12   ✗ ✗ ✓\nhttps://example.test/play/',
    );
    expect(block).not.toMatch(/Hypatia/);
  });

  it('a lost round is X; gave up and time up end in a dash; practice says so', () => {
    expect(
      shareResult({
        ...base,
        day: '2026-09-05',
        status: 'lost',
        score: 0,
        seconds: 61,
        guesses: guesses(false, false, false),
      }),
    ).toContain('\nX/10 in 1:01   ✗ ✗ ✗\n');
    expect(shareGlyphs(guesses(false), 'gaveUp')).toBe('✗ —');
    expect(shareGlyphs([], 'timeUp')).toBe('—');
    expect(shareGlyphs([], 'gaveUp')).toBe('—');
    expect(
      shareResult({
        ...base,
        day: null,
        status: 'gaveUp',
        score: 0,
        seconds: 300,
        guesses: guesses(false),
      }).split('\n')[0],
    ).toBe('The Game · Who am I? · Practice');
  });
});

describe('next figure countdown', () => {
  it('counts to UTC midnight', () => {
    const at = new Date('2026-09-05T17:48:00.000Z');
    expect(msUntilUtcMidnight(at)).toBe((6 * 60 + 12) * 60_000);
    expect(msUntilUtcMidnight(new Date('2026-09-05T00:00:00.000Z'))).toBe(86_400_000);
  });

  it('formats hours and minutes, minutes rounding up', () => {
    expect(formatCountdown((6 * 60 + 12) * 60_000)).toBe('6h 12m');
    expect(formatCountdown(6 * 3_600_000 + 11 * 60_000 + 1)).toBe('6h 12m');
    expect(formatCountdown(5 * 3_600_000)).toBe('5h 00m');
    expect(formatCountdown(12 * 60_000)).toBe('12m');
    expect(formatCountdown(30_000)).toBe('<1m');
    expect(formatCountdown(0)).toBe('now');
  });
});

describe('readouts', () => {
  it('two fixed digits', () => {
    expect(pad2(8)).toBe('08');
    expect(pad2(10)).toBe('10');
    expect(pad2(-1)).toBe('00');
    expect(clockParts(277_000)).toEqual({ mm: '04', ss: '37' });
    expect(clockParts(299_200)).toEqual({ mm: '05', ss: '00' });
    expect(clockParts(0)).toEqual({ mm: '00', ss: '00' });
  });
});
