import { describe, expect, it } from 'vitest';
import { composite, contrastRatio, parseCssColor } from './contrast';

describe('Mood contrast', () => {
  it('reads the colour formats the browser computes', () => {
    expect(parseCssColor('rgb(255, 255, 255)')).toEqual([255, 255, 255, 1]);
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual([0, 0, 0, 0.5]);
    expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5]);
    expect(parseCssColor('color(srgb 1 0 0.5)')).toEqual([255, 0, 127.5, 1]);
    expect(parseCssColor('color(srgb 0 0 0 / 0.25)')).toEqual([0, 0, 0, 0.25]);
    expect(parseCssColor('transparent')).toBeNull();
  });
  it('measures WCAG contrast', () => {
    const white = parseCssColor('rgb(255, 255, 255)')!;
    const black = parseCssColor('rgb(0, 0, 0)')!;
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    // #777 on white sits just under the 4.5 line
    expect(contrastRatio(parseCssColor('rgb(119, 119, 119)')!, white)).toBeCloseTo(4.48, 1);
  });
  it('lays a translucent surface over the page before measuring', () => {
    const page = parseCssColor('rgb(0, 0, 0)')!;
    const veil = composite(parseCssColor('rgba(255, 255, 255, 0.5)')!, page);
    expect(veil.map(Math.round)).toEqual([128, 128, 128, 1]);
  });
});
