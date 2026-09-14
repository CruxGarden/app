import { describe, it, expect } from 'vitest';
import { resolveSurfaceStyle } from './liquid-glass';

describe('resolveSurfaceStyle', () => {
  it("on and off override the Mood; system follows the Mood's surfaceStyle", () => {
    expect(resolveSurfaceStyle('on', 'solid')).toBe('glass');
    expect(resolveSurfaceStyle('off', 'glass')).toBe('solid');
    expect(resolveSurfaceStyle('system', 'glass')).toBe('glass');
    expect(resolveSurfaceStyle('system', 'solid')).toBe('solid');
    expect(resolveSurfaceStyle(null, undefined)).toBe('solid');
    expect(resolveSurfaceStyle('bogus', 'glass')).toBe('glass');
  });
});
