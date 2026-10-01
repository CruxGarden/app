import { describe, expect, it } from 'vitest';
import { CUSTOMIZER_GROUPS, resetCustomizer } from './customizer';
import { GARDEN_DARK } from './garden-dark';
import { BUNDLED_MOODS } from './bundled-moods';
import { huesFor, materialChoice, moodIdFor, type Material } from './material';

describe('guided customization', () => {
  it('uses real portable tokens and resets only the quick controls', () => {
    for (const group of CUSTOMIZER_GROUPS)
      for (const choice of group.choices)
        for (const key of Object.keys(choice.tokens)) expect(key in GARDEN_DARK, key).toBe(true);
    expect(
      resetCustomizer({
        radius: '9px',
        accent: '#123456',
        fontBody: 'Georgia',
        workspaceTexture: 'none',
        secondaryActionOpacity: '0.8',
      }),
    ).toEqual({ workspaceTexture: 'none', secondaryActionOpacity: '0.8' });
  });
  it('every family/hue/mode selects an existing package and can be recognized again', () => {
    for (const material of ['plasma', 'soft', 'paper'] as Material[])
      for (const hue of huesFor(material))
        for (const mode of ['light', 'dark'] as const) {
          const id = moodIdFor(material, hue.id, mode);
          expect(
            BUNDLED_MOODS.some((m) => m.id === id),
            id,
          ).toBe(true);
          expect(materialChoice(`user-${id}`)).toEqual({ material, hue: hue.id, mode });
        }
    expect(moodIdFor('paper', 'neutral', 'dark')).toBe('expedition-sunflower-dark');
  });
});
