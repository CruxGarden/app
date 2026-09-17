import { describe, it, expect } from 'vitest';
import { resolveSurfaceStyle, normalizeSurfaceTheme } from './liquid-glass';

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

describe('surface themes', () => {
  it('Plasma and Glass take every surface; Custom leaves it to the Mood', () => {
    expect(resolveSurfaceStyle('plasma', 'solid')).toBe('plasma');
    expect(resolveSurfaceStyle('glass', 'solid')).toBe('glass');
    expect(resolveSurfaceStyle('custom', 'glass')).toBe('glass');
    expect(resolveSurfaceStyle('custom', 'solid')).toBe('solid');
    expect(resolveSurfaceStyle('custom', 'plasma')).toBe('plasma');
  });

  it('keeps what the two-way switch meant', () => {
    expect(resolveSurfaceStyle('on', 'solid')).toBe('glass');
    expect(resolveSurfaceStyle('off', 'glass')).toBe('solid');
    expect(resolveSurfaceStyle('system', 'glass')).toBe('glass');
  });

  it('shows a legacy setting as the nearest theme', () => {
    expect(normalizeSurfaceTheme('on')).toBe('glass');
    expect(normalizeSurfaceTheme('off')).toBe('custom');
    expect(normalizeSurfaceTheme('system')).toBe('custom');
    expect(normalizeSurfaceTheme(null)).toBe('custom');
    expect(normalizeSurfaceTheme('plasma')).toBe('plasma');
  });
});
