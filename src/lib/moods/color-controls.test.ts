import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editableColor, colorWithAlpha } from './color-controls';

describe('Mood color transparency', () => {
  it('preserves alpha when the RGB picker changes the hue', () => {
    const color = editableColor('rgba(40, 43, 76, 0.5)')!;
    expect(color).toEqual({ hex: '#282b4c', alpha: 0.5 });
    expect(colorWithAlpha('#aabbcc', color.alpha)).toBe('rgba(170, 187, 204, 0.5)');
    expect(colorWithAlpha('#aabbcc', 1)).toBe('#aabbcc');
  });
  it('supports transparent colors and computed color-mix results', () => {
    expect(editableColor('rgba(40, 43, 76, 0)')).toEqual({ hex: '#282b4c', alpha: 0 });
    expect(editableColor('color(srgb 1 0.5 0 / 0.25)')).toEqual({ hex: '#ff8000', alpha: 0.25 });
    expect(editableColor('rgb(40, 43, 76)')?.alpha).toBe(1);
    expect(editableColor('not a color')).toBeNull();
  });
});

// Structure may show/hide controls, but partial dimming must belong to a Mood.
it('keeps hidden dimming out of first-party components', () => {
  const root = join(__dirname, '../../components');
  const offenders: string[] = [];
  for (const name of readdirSync(root, { recursive: true }) as string[]) {
    if (!/\.tsx?$/.test(name) || /\.test\./.test(name)) continue;
    const source = readFileSync(join(root, name), 'utf8');
    if (
      /\bopacity-(?:[1-9]\d?)(?![\d])|(?:text|bg|border|ring|outline|divide|from|via|to|fill|stroke)-[a-z-]+\/[1-9]\d?\b/.test(
        source,
      )
    )
      offenders.push(name);
  }
  expect(offenders).toEqual([]);
});
