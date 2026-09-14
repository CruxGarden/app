import { describe, it, expect } from 'vitest';
import { revealAlpha, gsapEaseFor } from './set-piece';

describe('revealAlpha', () => {
  it('is nothing at the start and everything at the end', () => {
    expect(revealAlpha(0, 0, 10)).toBe(0);
    expect(revealAlpha(1, 9, 10)).toBe(1);
    expect(revealAlpha(0.5, 0, 0)).toBe(1);
  });

  it('brings nodes in time order, the first settled before the last starts', () => {
    const n = 10;
    expect(revealAlpha(0.34, 0, n)).toBe(1);
    expect(revealAlpha(0.34, 9, n)).toBe(0);
    const mid = revealAlpha(0.5, 5, n);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    for (let t = 0; t <= 1; t += 0.1)
      expect(revealAlpha(t, 2, n)).toBeGreaterThanOrEqual(revealAlpha(t, 7, n));
  });
});

describe('gsapEaseFor', () => {
  it("turns the Mood's curve into a registered ease and reuses it", () => {
    const a = gsapEaseFor({
      easeEnter: 'cubic-bezier(0.16, 1, 0.3, 1)',
      frames: 0,
      intensity: 'normal',
    });
    const b = gsapEaseFor({
      easeEnter: 'cubic-bezier(0.16, 1, 0.3, 1)',
      frames: 0,
      intensity: 'normal',
    });
    expect(a).toMatch(/^mood-/);
    expect(b).toBe(a);
  });

  it('steps for pixel Moods, overshoots under expressive, falls back for the rest', () => {
    expect(gsapEaseFor({ easeEnter: 'linear', frames: 4, intensity: 'normal' })).toBe('steps(4)');
    expect(gsapEaseFor({ easeEnter: 'linear', frames: 0, intensity: 'expressive' })).toBe(
      'back.out(1.4)',
    );
    expect(gsapEaseFor({ easeEnter: 'linear', frames: 0, intensity: 'normal' })).toBe('power2.out');
  });
});
