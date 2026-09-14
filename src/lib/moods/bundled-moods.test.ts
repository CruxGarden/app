import { describe, it, expect } from 'vitest';
import { BUNDLED_MOODS, bundledMood } from './bundled-moods';
import { validateMoodPackage } from './packages';
import { GARDEN_DARK } from './garden-dark';
import { tokenChoices } from './token-groups';

describe('bundled Moods (ADR 0043: the backgrounds set)', () => {
  it('ships thirty-six complete, valid packages with distinct ids', () => {
    expect(BUNDLED_MOODS).toHaveLength(36);
    expect(new Set(BUNDLED_MOODS.map((m) => m.id)).size).toBe(36);
    for (const m of BUNDLED_MOODS) {
      const ok = validateMoodPackage(JSON.parse(JSON.stringify(m)));
      expect(ok, `${m.id} validates`).toBeTruthy();
      expect(ok!.sound.volume).toBeGreaterThanOrEqual(0);
      expect(ok!.sound.volume).toBeLessThanOrEqual(1);
      expect(ok!.sound.enabled).toBe(true);
      expect(ok!.sound.cues).toEqual(m.sound.cues);
      expect(m.persona?.name, `${m.id} has a voice`).toBeTruthy();
      expect(m.persona?.greeting, `${m.id} greets`).toBeTruthy();
    }
  });

  it('Digital Fractal Garden is the Default Mood: first, glass, the fractal render, Iris, the one track', () => {
    const d = BUNDLED_MOODS[0]!;
    expect(d.id).toBe('digital-fractal-garden');
    expect(d.theme.section).toBe('Dark');
    expect(d.theme.overrides.accent).toBe('#5fd2a5');
    expect(d.theme.overrides.surfaceStyle).toBe('glass');
    expect(d.background.type).toBe('image');
    expect(d.persona?.name).toBe('Iris');
    expect(d.bundled?.background).toMatch(/digital-fractal-garden/);
    expect(d.bundled?.track).toMatchObject({ name: 'Echoes From Beyond', type: 'audio/ogg' });
    expect(d.sound.track).toBeNull();
    const ok = validateMoodPackage(JSON.parse(JSON.stringify(d)))!;
    expect(ok.sound).toEqual(d.sound);
    // every Mood is a render from backgrounds/; only the default brings a track
    expect(BUNDLED_MOODS.every((m) => m.bundled?.background && m.background.type === 'image')).toBe(
      true,
    );
    expect(BUNDLED_MOODS.filter((m) => m.bundled?.track)).toHaveLength(1);
    // The Keeper is no longer a Mood; its track and face live on as the default's sound and the fallback avatar
    expect(bundledMood('the-keeper')).toBeUndefined();
  });

  it('covers both modes and only uses real theme tokens', () => {
    const sections = new Set(BUNDLED_MOODS.map((m) => m.theme.section));
    expect(sections).toEqual(new Set(['Dark', 'Light']));
    expect(BUNDLED_MOODS.filter((m) => m.theme.section === 'Light').length).toBeGreaterThanOrEqual(
      4,
    );
    for (const m of BUNDLED_MOODS) {
      const unknown = Object.keys(m.theme.overrides).filter((k) => !(k in GARDEN_DARK));
      expect(unknown, `${m.id} unknown tokens`).toEqual([]);
    }
  });

  it('wears liquid glass by default, with the opacity readability needs over a render', () => {
    for (const m of BUNDLED_MOODS) {
      const o = m.theme.overrides;
      expect(o.surfaceStyle, m.id).toBe('glass');
      const opacity = parseFloat(o.glassOpacity ?? '0');
      expect(opacity, `${m.id} glass opacity`).toBeGreaterThanOrEqual(
        m.theme.section === 'Light' ? 70 : 60,
      );
      expect(parseFloat(o.bgImageDim ?? '0'), `${m.id} dims its render`).toBeGreaterThan(0);
    }
  });

  it('stays square-ish (Daniel): round or bevel corners, solid hairline frames, no gradient rings', () => {
    for (const m of BUNDLED_MOODS) {
      const o = m.theme.overrides;
      expect(['round', 'bevel'], `${m.id} corners`).toContain(o.paneCornerShape);
      expect(o.paneBorderStyle, `${m.id} frame`).toBe('solid');
      expect(o.dividerStyle, `${m.id} dividers`).toBe('hairline');
      for (const key of Object.keys(o))
        if (/Border$/.test(key)) expect(o[key], `${m.id} ${key}`).not.toMatch(/gradient/);
      for (const key of ['paneHeaderShape', 'paneCornerShape', 'controlCornerShape'] as const)
        expect(tokenChoices(key), key).toContain(o[key] ?? GARDEN_DARK[key]);
    }
  });

  it('varies beyond palettes: radius, gutters, type, motion, voice and silhouette all move', () => {
    const pick = (key: string) =>
      new Set(
        BUNDLED_MOODS.map(
          (m) => m.theme.overrides[key] ?? (GARDEN_DARK as Record<string, string>)[key],
        ),
      );
    expect(pick('radius').size).toBeGreaterThanOrEqual(5);
    expect(pick('paneGap').size).toBeGreaterThanOrEqual(4);
    expect(pick('fontDisplay').size).toBeGreaterThanOrEqual(3);
    expect(pick('motionEnterDialog').size).toBeGreaterThanOrEqual(4);
    expect(pick('motionAmbient').size).toBeGreaterThanOrEqual(3);
    expect(pick('paneHeaderShape').size).toBeGreaterThanOrEqual(3);
    expect(pick('paneCornerShape').size).toBe(2);
    expect(pick('iconSet').size).toBe(3);
    expect(new Set(BUNDLED_MOODS.map((m) => m.persona!.name)).size).toBe(36);
    // named rooms the journeys lean on
    expect(bundledMood('raster-bars')?.theme.overrides.motionFrames).toBe('4');
    expect(bundledMood('raster-bars')?.theme.overrides.iconSet).toBe('pixel');
    expect(bundledMood('hibiscus')?.theme.overrides.iconSet).toBe('filled');
    expect(bundledMood('mountain-grey')?.theme.overrides.motionEnterDialog).toBe('none');
    expect(bundledMood('mountain-grey')?.theme.overrides.motionIntensity).toBe('subtle');
    expect(bundledMood('jade-capital')?.theme.overrides.motionExitDialog).toBe('scale');
    expect(bundledMood('coral-castle')?.theme.overrides.motionAmbient).toBe('float');
  });
});
