import { describe, expect, it } from 'vitest';
import { BUNDLED_MOODS } from './bundled-moods';
import { exportMoodPackage, importMoodPackage } from './packages';
import { groupTokens, tokenKind } from './token-groups';

const expedition = BUNDLED_MOODS.filter((m) => m.id.startsWith('expedition-'));

describe('portable paper Moods', () => {
  it('round-trips every light/dark palette without network assets or AI', async () => {
    expect(expedition).toHaveLength(6);
    for (const mood of expedition) {
      const noAssets = async (): Promise<never> => {
        throw new Error('Paper Moods need no assets');
      };
      const zip = await exportMoodPackage(mood, noAssets);
      const imported = await importMoodPackage(await zip.arrayBuffer(), noAssets);
      expect(imported).not.toBeNull();
      expect(imported!.theme.overrides).toEqual(mood.theme.overrides);
      expect(imported!.background.type).toBe('blank');
      expect(imported!.assets).toEqual([]);
    }
  });

  it('keeps text readable across all six palettes and their colored headers', () => {
    const luminance = (hex: string) => {
      const rgb = hex
        .slice(1)
        .match(/../g)!
        .map((part) => parseInt(part, 16) / 255);
      const [r, g, b] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => {
      const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (values[0]! + 0.05) / (values[1]! + 0.05);
    };
    for (const mood of expedition) {
      const o = mood.theme.overrides;
      for (const surface of ['bg', 'panel', 'surface'])
        for (const text of ['text', 'textMuted', 'accent'])
          expect(
            contrast(o[text]!, o[surface]!),
            `${mood.id}: ${text} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(o.primaryButtonText!, o.primaryButton!)).toBeGreaterThanOrEqual(4.5);
      for (const key of Object.keys(o).filter((k) => /^pane.*Header$/.test(k)))
        expect(contrast(o[`${key}Text`]!, o[key]!), `${mood.id}: ${key}`).toBeGreaterThanOrEqual(
          4.5,
        );
    }
  });

  it('exposes the new controls in the builder with appropriate editors', () => {
    const exposed = groupTokens().flatMap((g) => g.keys);
    for (const key of [
      'elevationPane',
      'elevationButton',
      'elevationPrimaryButton',
      'buttonFillOverlay',
    ]) {
      expect(exposed).toContain(key);
      expect(tokenKind(key)).toBe('text');
    }
    expect(exposed).toContain('buttonBorderWidth');
    expect(tokenKind('buttonBorderWidth')).toBe('length');
  });
});
