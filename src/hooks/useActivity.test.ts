import { describe, it, expect } from 'vitest';
import { litLevel, LIT_FROM } from './useActivity';

describe('the lit ramp — the last stage of the garden warming up', () => {
  it('stays dark through the range where only the colour comes back', () => {
    expect(litLevel(0)).toBe(0);
    expect(litLevel(LIT_FROM / 2)).toBe(0);
    expect(litLevel(LIT_FROM)).toBe(0);
  });

  it('climbs only above the threshold, reaching full at full activity', () => {
    expect(litLevel(LIT_FROM + (1 - LIT_FROM) / 2)).toBeCloseTo(0.5, 5);
    expect(litLevel(1)).toBe(1);
    // A signal cannot exceed 1, but the ramp must not either if one ever did.
    expect(litLevel(2)).toBe(1);
  });

  it('is monotonic, so the rim never dips while the garden gets busier', () => {
    let prev = -1;
    for (let a = 0; a <= 1.0001; a += 1 / 64) {
      const v = litLevel(a);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('degenerates safely if a threshold of 1 is ever configured', () => {
    expect(litLevel(0.99, 1)).toBe(0);
    expect(litLevel(1, 1)).toBe(1);
  });
});
