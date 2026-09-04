import { describe, it, expect } from 'vitest';
import { BUNDLED_MOODS, bundledMood } from './bundled-moods';
import { DEFAULT_MIXES } from '@/audio/default-mixes';
import { validateMoodPackage } from './packages';
import { validateMix, LAYER_TYPES } from '@/audio/schema';
import { GARDEN_DARK } from './garden-dark';
import { tokenChoices } from './token-groups';

describe('bundled Moods', () => {
  it('ships thirteen complete, valid packages with distinct ids', () => {
    expect(BUNDLED_MOODS).toHaveLength(13);
    expect(new Set(BUNDLED_MOODS.map((m) => m.id)).size).toBe(13);
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

  it('is not thirteen palettes on one layout: shape, type and motion differ', () => {
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
    // Windows 95 snaps: transitions and enters take no time, only the blink keeps a cadence
    expect(bundledMood('windows-95')?.theme.overrides.motionDurationFast).toBe('0ms');
    // ── motion ── (ADR 0014) how things appear and idle differs too
    const enters = new Set(
      BUNDLED_MOODS.map(
        (m) => m.theme.overrides.motionEnterDialog ?? GARDEN_DARK.motionEnterDialog,
      ),
    );
    const ambients = new Set(
      BUNDLED_MOODS.map((m) => m.theme.overrides.motionAmbient ?? GARDEN_DARK.motionAmbient),
    );
    expect(enters.size).toBeGreaterThanOrEqual(4);
    expect(ambients.size).toBeGreaterThanOrEqual(3);
    expect(bundledMood('sunday-paper')?.theme.overrides.motionEnterDialog).toBe('none');
    // ── shape ── (ADR 0014) the tokens exist and every Mood resolves to a legal
    // option. Per-Mood silhouettes (Windows 95 outset, Sunday Paper double, tab
    // and underline headers) are the unfinished half of the shape pass; when it
    // lands, assert spread here the way motion and icons do above.
    for (const m of BUNDLED_MOODS) {
      for (const key of ['paneHeaderShape', 'paneCornerShape', 'paneBorderStyle'] as const) {
        const value = m.theme.overrides[key] ?? GARDEN_DARK[key];
        expect(tokenChoices(key), `${key} is a choice token`).toBeTruthy();
        expect(tokenChoices(key), `${m.id} ${key}=${value}`).toContain(value);
      }
    }
    // ── icons ── (ADR 0014) the glyph set is part of the room: at least two sets in use
    const icons = new Set(
      BUNDLED_MOODS.map((m) => m.theme.overrides.iconSet ?? GARDEN_DARK.iconSet),
    );
    expect(icons.size).toBeGreaterThanOrEqual(2);
    expect(bundledMood('windows-95')?.theme.overrides.iconSet).toBe('pixel');
    expect(bundledMood('pretty-in-pink')?.theme.overrides.iconSet).toBe('filled');
    expect(bundledMood('deep-sea')?.theme.overrides.motionAmbient).toBe('breathe');
  });

  it('ships mixes already inside every parameter range (validateMix is the identity)', () => {
    const all = [...BUNDLED_MOODS.flatMap((m) => m.resonance.mixes), ...DEFAULT_MIXES];
    for (const mix of all) expect(validateMix(mix), mix.id).toEqual(mix);
  });
});
