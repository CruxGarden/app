import { describe, it, expect } from 'vitest';
import { ICONS, ICON_NAMES, px } from './icon-paths';
import { ICON_SETS } from '@/lib/moods/icon-set';

/**
 * Every glyph exists in every set (ADR 0014: sets are alternative paths behind
 * the same names), every path draws something, and the pixel set stays on the
 * integer grid so crispEdges has nothing to blur.
 */
describe('icon sets', () => {
  it('names three sets and every glyph has all of them', () => {
    expect(ICON_SETS).toEqual(['line', 'filled', 'pixel']);
    expect(ICON_NAMES.length).toBeGreaterThanOrEqual(39);
    for (const name of ICON_NAMES) {
      const g = ICONS[name];
      for (const set of ICON_SETS) {
        const d = g[set];
        expect(typeof d, `${name}.${set}`).toBe('string');
        expect(d.trim().length, `${name}.${set} draws`).toBeGreaterThan(0);
        expect(d, `${name}.${set} starts with a move`).toMatch(/^M/);
      }
    }
  });

  it('pixel glyphs use integer coordinates only, inside the 16 grid', () => {
    for (const name of ICON_NAMES) {
      const d = ICONS[name].pixel;
      const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
      expect(numbers.length, `${name}.pixel has coordinates`).toBeGreaterThan(0);
      for (const n of numbers) {
        expect(n, `${name}.pixel "${n}"`).not.toContain('.');
      }
      // every run is a unit-high rectangle: M x y h w v1 h-w z
      for (const run of d.match(/M[^M]+/g) ?? []) {
        const m = /^M(\d+) (\d+)h(\d+)v1h-(\d+)z$/.exec(run);
        expect(m, `${name}.pixel run "${run}"`).not.toBeNull();
        const [, x, y, w, w2] = m!.map(Number);
        expect(w).toBe(w2);
        expect(x! + w!).toBeLessThanOrEqual(16);
        expect(y!).toBeLessThan(16);
      }
    }
  });

  it('px() turns 16×16 art into runs and refuses other shapes', () => {
    const blank = Array(16).fill('................');
    expect(px(blank)).toBe('');
    const rows = [...blank];
    rows[3] = '..###....#......';
    expect(px(rows)).toBe('M2 3h3v1h-3zM9 3h1v1h-1z');
    expect(() => px(rows.slice(1))).toThrow(/16 rows/);
    expect(() => px([...blank.slice(0, 15), '#'])).toThrow(/16 columns/);
  });

  it('line and filled glyphs share the 24 grid (no coordinate leaves it)', () => {
    for (const name of ICON_NAMES) {
      for (const set of ['line', 'filled'] as const) {
        const abs = ICONS[name][set].match(/[ML](-?\d+(\.\d+)?) (-?\d+(\.\d+)?)/g) ?? [];
        for (const pt of abs) {
          const [x, y] = pt.slice(1).split(' ').map(Number);
          expect(x, `${name}.${set} ${pt}`).toBeGreaterThanOrEqual(0);
          expect(x, `${name}.${set} ${pt}`).toBeLessThanOrEqual(24);
          expect(y, `${name}.${set} ${pt}`).toBeGreaterThanOrEqual(0);
          expect(y, `${name}.${set} ${pt}`).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});
