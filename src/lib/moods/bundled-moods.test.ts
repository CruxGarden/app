import { describe, it, expect } from 'vitest';
import { BUNDLED_MOODS, SHELVED_MOODS, bundledMood, refreshBundledPresets } from './bundled-moods';

const ALL = [...BUNDLED_MOODS, ...SHELVED_MOODS];
import { getUserPresets, saveUserPreset } from './user-presets';
import { validateMoodPackage } from './packages';
import { GARDEN_DARK } from './garden-dark';
import { tokenChoices } from './token-groups';

describe('bundled Moods (the backgrounds set, the soft suite and the Plasma family)', () => {
  it('ships sixty-five Moods and shelves Office, all complete and valid with distinct ids', () => {
    expect(BUNDLED_MOODS).toHaveLength(65);
    expect(SHELVED_MOODS.map((m) => m.id)).toEqual(['office']);
    expect(new Set(ALL.map((m) => m.id)).size).toBe(66);
    for (const m of ALL) {
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

  it('Plasma is the Default Mood: first, the material, Vel, no render', () => {
    const d = BUNDLED_MOODS[0]!;
    expect(d.id).toBe('plasma');
    expect(d.theme.section).toBe('Dark');
    expect(d.theme.overrides.accent).toBe('#9ff3e4');
    expect(d.theme.overrides.surfaceStyle).toBe('plasma');
    // The one Mood with no render: the material draws its own field, the
    // same one the crux.garden landing page shows.
    expect(d.background.type).toBe('blank');
    expect(d.bundled?.background).toBeUndefined();
    expect(d.persona?.name).toBe('Vel');
    const ok = validateMoodPackage(JSON.parse(JSON.stringify(d)))!;
    expect(ok.sound).toEqual(d.sound);
  });

  it('Fractal Garden keeps the render, Iris and the one track', () => {
    const f = bundledMood('digital-fractal-garden')!;
    expect(f.theme.section).toBe('Dark');
    expect(f.theme.overrides.accent).toBe('#5fd2a5');
    expect(f.theme.overrides.surfaceStyle).toBe('glass');
    expect(f.background.type).toBe('image');
    expect(f.persona?.name).toBe('Iris');
    expect(f.bundled?.background).toMatch(/digital-fractal-garden/);
    expect(f.bundled?.track).toMatchObject({ name: 'Echoes From Beyond', type: 'audio/ogg' });
    expect(f.sound.track).toBeNull();
    // Every Mood is a render from backgrounds/ - except Plasma, whose
    // material draws its own field - and exactly one brings a track.
    // Every glass Mood is a render from backgrounds/; the material Moods —
    // Plasma, its family and the soft suite — draw their own ground.
    expect(
      ALL.filter((m) => m.theme.overrides.surfaceStyle !== 'plasma').every(
        (m) => m.bundled?.background && m.background.type === 'image',
      ),
    ).toBe(true);
    expect(ALL.filter((m) => m.bundled?.track)).toHaveLength(1);
  });

  it('covers both modes and only uses real theme tokens', () => {
    const sections = new Set(BUNDLED_MOODS.map((m) => m.theme.section));
    expect(sections).toEqual(new Set(['Dark', 'Light']));
    expect(BUNDLED_MOODS.filter((m) => m.theme.section === 'Light').length).toBeGreaterThanOrEqual(
      4,
    );
    for (const m of ALL) {
      const unknown = Object.keys(m.theme.overrides).filter((k) => !(k in GARDEN_DARK));
      expect(unknown, `${m.id} unknown tokens`).toEqual([]);
    }
  });

  it('wears liquid glass by default, with the opacity readability needs over a render', () => {
    for (const m of ALL) {
      const o = m.theme.overrides;
      // Plasma is the one Mood built for the other theme: the material
      // draws its surfaces, so the glass tokens below do not apply to it.
      if (o.surfaceStyle === 'plasma') continue;
      expect(o.surfaceStyle, m.id).toBe('glass');
      const opacity = parseFloat(o.glassOpacity ?? '0');
      expect(opacity, `${m.id} glass opacity`).toBeGreaterThanOrEqual(
        m.theme.section === 'Light' ? 70 : 60,
      );
      expect(parseFloat(o.bgImageDim ?? '0'), `${m.id} dims its render`).toBeGreaterThan(0);
    }
  });

  it('stays square-ish (Daniel): round or bevel corners, solid hairline frames, no gradient rings', () => {
    for (const m of ALL) {
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
        ALL.map((m) => m.theme.overrides[key] ?? (GARDEN_DARK as Record<string, string>)[key]),
      );
    expect(pick('radius').size).toBeGreaterThanOrEqual(5);
    expect(pick('paneGap').size).toBeGreaterThanOrEqual(4);
    expect(pick('fontDisplay').size).toBeGreaterThanOrEqual(3);
    expect(pick('motionEnterDialog').size).toBeGreaterThanOrEqual(4);
    expect(pick('motionAmbient').size).toBeGreaterThanOrEqual(3);
    expect(pick('paneHeaderShape').size).toBeGreaterThanOrEqual(3);
    expect(pick('paneCornerShape').size).toBe(2);
    expect(pick('iconSet').size).toBe(3);
    expect(new Set(ALL.map((m) => m.persona!.name)).size).toBe(66);
    // named rooms the journeys lean on
    expect(bundledMood('raster-bars')?.theme.overrides.motionFrames).toBe('4');
    expect(bundledMood('raster-bars')?.theme.overrides.iconSet).toBe('pixel');
    expect(bundledMood('hibiscus')?.theme.overrides.iconSet).toBe('filled');
    expect(bundledMood('mountain-grey')?.theme.overrides.motionEnterDialog).toBe('none');
    expect(bundledMood('mountain-grey')?.theme.overrides.motionIntensity).toBe('subtle');
    expect(bundledMood('jade-capital')?.theme.overrides.motionExitDialog).toBe('scale');
    expect(bundledMood('coral-castle')?.theme.overrides.motionAmbient).toBe('float');
  });

  it("a garden wearing a bundled Mood follows the Mood as it ships now, and a person's own preset is left alone", () => {
    saveUserPreset({
      id: 'user-plasma',
      name: 'Plasma',
      section: 'Dark',
      overrides: { accent: '#9ff3e4', plasmaFrame: '10px' },
      author: 'Crux Garden',
    });
    saveUserPreset({
      id: 'user-night-city',
      name: 'Mine',
      section: 'Dark',
      overrides: { accent: '#fff' },
      author: 'daniel',
    });
    expect(refreshBundledPresets()).toEqual(['user-plasma']);
    const plasma = getUserPresets().find((p) => p.id === 'user-plasma')!;
    expect(plasma.overrides.plasmaFrame).toBe('0px');
    expect(plasma.overrides.plasmaPlate).toBe('transparent');
    expect(plasma.overrides).toEqual(bundledMood('plasma')!.theme.overrides);
    expect(getUserPresets().find((p) => p.id === 'user-night-city')!.overrides).toEqual({
      accent: '#fff',
    });
    // Up to date: nothing to do.
    expect(refreshBundledPresets()).toEqual([]);
  });
});
