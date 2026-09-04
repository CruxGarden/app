import { describe, it, expect } from 'vitest';
import { BUNDLED_MOODS, bundledMood } from './bundled-moods';
import { validateMoodPackage } from './packages';
import { validateMix, LAYER_TYPES } from '@/audio/schema';
import { GARDEN_DARK } from './garden-dark';

describe('bundled Moods', () => {
  it('ships eight complete, valid packages with distinct ids', () => {
    expect(BUNDLED_MOODS).toHaveLength(8);
    expect(new Set(BUNDLED_MOODS.map((m) => m.id)).size).toBe(8);
    for (const m of BUNDLED_MOODS) {
      const ok = validateMoodPackage(JSON.parse(JSON.stringify(m)));
      expect(ok, `${m.id} validates`).toBeTruthy();
      expect(ok!.resonance.mixes.length, `${m.id} has sound`).toBeGreaterThan(0);
      expect(ok!.resonance.mixes.map((x) => x.id)).toContain(ok!.resonance.activeMixId);
      expect(m.persona?.name, `${m.id} has a voice`).toBeTruthy();
      for (const mix of m.resonance.mixes) {
        const v = validateMix(mix)!;
        expect(v.layers.length, `${mix.id} layers`).toBeGreaterThan(0);
        for (const l of v.layers) expect(LAYER_TYPES).toContain(l.type);
      }
    }
  });

  it('covers both modes and only uses real theme tokens', () => {
    const sections = new Set(BUNDLED_MOODS.map((m) => m.theme.section));
    expect(sections).toEqual(new Set(['Dark', 'Light']));
    for (const m of BUNDLED_MOODS) {
      const unknown = Object.keys(m.theme.overrides).filter((k) => !(k in GARDEN_DARK));
      expect(unknown, `${m.id} unknown tokens`).toEqual([]);
    }
  });

  it('is not eight palettes on one layout: shape, type and motion differ', () => {
    const radii = new Set(BUNDLED_MOODS.map((m) => m.theme.overrides.radius ?? GARDEN_DARK.radius));
    const fonts = new Set(
      BUNDLED_MOODS.map((m) => m.theme.overrides.fontDisplay ?? GARDEN_DARK.fontDisplay),
    );
    const gaps = new Set(
      BUNDLED_MOODS.map((m) => m.theme.overrides.paneGap ?? GARDEN_DARK.paneGap),
    );
    const motion = new Set(
      BUNDLED_MOODS.map((m) => m.theme.overrides.motionScale ?? GARDEN_DARK.motionScale),
    );
    const backgrounds = new Set(BUNDLED_MOODS.map((m) => m.background.type));
    expect(radii.size).toBeGreaterThanOrEqual(4);
    expect(fonts.size).toBeGreaterThanOrEqual(3);
    expect(gaps.size).toBeGreaterThanOrEqual(4);
    expect(motion.size).toBeGreaterThanOrEqual(3);
    expect(backgrounds.size).toBeGreaterThanOrEqual(3);
    expect(bundledMood('windows-95')?.theme.overrides.motionScale).toBe('0');
  });
});
