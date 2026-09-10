import { describe, it, expect } from 'vitest';
import { BUNDLED_MOODS, bundledMood } from './bundled-moods';
import { validateMoodPackage } from './packages';
import { GARDEN_DARK } from './garden-dark';
import { DEFAULT_PERSONA } from '@/services/persona';
import { tokenChoices } from './token-groups';

describe('bundled Moods', () => {
  it('ships twenty-four complete, valid packages with distinct ids', () => {
    expect(BUNDLED_MOODS).toHaveLength(24);
    expect(new Set(BUNDLED_MOODS.map((m) => m.id)).size).toBe(24);
    for (const m of BUNDLED_MOODS) {
      const ok = validateMoodPackage(JSON.parse(JSON.stringify(m)));
      expect(ok, `${m.id} validates`).toBeTruthy();
      expect(ok!.sound.volume).toBeGreaterThanOrEqual(0);
      expect(ok!.sound.volume).toBeLessThanOrEqual(1);
      expect(ok!.sound.enabled).toBe(true);
      expect(ok!.sound.cues).toEqual(m.sound.cues);
      expect(m.persona?.name, `${m.id} has a voice`).toBeTruthy();
    }
  });

  it('The Keeper is the Default Mood: first, Moss, the vista, the Keeper voice and face, one track', () => {
    const k = BUNDLED_MOODS[0]!;
    expect(k.id).toBe('the-keeper');
    expect(k.theme.section).toBe('Dark');
    expect(k.theme.overrides.accent).toBe('#88bc88'); // Moss
    expect(k.background.type).toBe('image');
    expect(k.persona).toMatchObject({
      name: DEFAULT_PERSONA.name,
      systemPrompt: DEFAULT_PERSONA.systemPrompt,
    });
    // the files ship inside the app; the package carries them as URLs until apply
    expect(k.bundled?.background).toMatch(/vista/);
    expect(k.bundled?.avatar).toMatch(/keeper-avatar/);
    expect(k.bundled?.track).toMatchObject({ name: 'Echoes From Beyond', type: 'audio/ogg' });
    expect(k.sound.track).toBeNull();
    // and validation (the shape a saved/imported package takes) keeps the sound block
    const ok = validateMoodPackage(JSON.parse(JSON.stringify(k)))!;
    expect(ok.sound).toEqual(k.sound);
    // Five Moods ship backgrounds; only The Keeper brings a track.
    expect(BUNDLED_MOODS.filter((m) => m.bundled)).toHaveLength(5);
    expect(BUNDLED_MOODS.filter((m) => m.bundled?.track)).toHaveLength(1);
  });

  it('covers both modes and only uses real theme tokens', () => {
    const sections = new Set(BUNDLED_MOODS.map((m) => m.theme.section));
    expect(sections).toEqual(new Set(['Dark', 'Light']));
    for (const m of BUNDLED_MOODS) {
      const unknown = Object.keys(m.theme.overrides).filter((k) => !(k in GARDEN_DARK));
      expect(unknown, `${m.id} unknown tokens`).toEqual([]);
    }
  });

  it('varies beyond palettes on one layout: shape, type and motion differ', () => {
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
    // Shape has to change the silhouette, not merely resolve to legal defaults.
    for (const [key, minimum] of [
      ['paneHeaderShape', 5],
      ['paneCornerShape', 5],
      ['controlCornerShape', 3],
      ['paneBorderStyle', 4],
      ['dividerStyle', 5],
      ['cardBorderStyle', 4],
    ] as const) {
      const values = BUNDLED_MOODS.map((m) => m.theme.overrides[key] ?? GARDEN_DARK[key]);
      expect(new Set(values).size, `${key} spread`).toBeGreaterThanOrEqual(minimum);
      for (const value of values) expect(tokenChoices(key), key).toContain(value);
    }
    // ── icons ── (ADR 0014) the glyph set is part of the room: at least two sets in use
    const icons = new Set(
      BUNDLED_MOODS.map((m) => m.theme.overrides.iconSet ?? GARDEN_DARK.iconSet),
    );
    expect(icons.size).toBeGreaterThanOrEqual(2);
    expect(bundledMood('windows-95')?.theme.overrides.iconSet).toBe('pixel');
    expect(bundledMood('pretty-in-pink')?.theme.overrides.iconSet).toBe('filled');
    expect(bundledMood('deep-sea')?.theme.overrides.motionAmbient).toBe('breathe');
    // Soft Serve is the frameless one: no pane border, cards unbordered, the title over a hairline
    const soft = bundledMood('soft-serve')!.theme.overrides;
    expect(soft.paneBorderStyle).toBe('none');
    expect(soft.paneBorderWidth).toBe('0px');
    expect(soft.cardBorderStyle).toBe('none');
    expect(soft.paneHeaderShape).toBe('underline');
    // Soft Serve Night is the same silhouette after dark: navy ground, cream titles, coral kept
    const night = bundledMood('soft-serve-night')!.theme.overrides;
    expect(night.paneBorderStyle).toBe('none');
    expect(night.paneBorderWidth).toBe('0px');
    expect(night.cardBorderStyle).toBe('none');
    expect(night.paneHeaderShape).toBe('underline');
    expect(night.cardRadius).toBe(soft.cardRadius);
    expect(night.paneHeaderLabelWeight).toBe(soft.paneHeaderLabelWeight);
    expect(night.motionEnterBubble).toBe(soft.motionEnterBubble);
    expect(bundledMood('soft-serve-night')!.theme.section).toBe('Dark');
    // Gray and Black: the same silhouette and tighter gutters, the orange only a highlight —
    // pane identities are neutral except where the conversation happens and where it goes live
    const gray = bundledMood('soft-serve-gray')!.theme.overrides;
    const black = bundledMood('soft-serve-black')!.theme.overrides;
    for (const o of [gray, black]) {
      expect(o.paneBorderStyle).toBe('none');
      expect(o.paneHeaderShape).toBe('underline');
      expect(o.cardRadius).toBe(soft.cardRadius);
      expect(o.paneGap).toBe('10px');
      expect(o.workspacePadding).toBe('10px');
      expect(o.accent).toBe('#F26B3A');
      expect(o.paneCollaboration).toBe(o.accent);
      expect(o.panePublish).toBe(o.accent);
      expect(o.paneWorkshop).not.toBe(o.accent);
      expect(o.paneArtifacts).not.toBe(o.accent);
    }
    expect(soft.paneGap).toBe('10px');
    expect(night.workspacePadding).toBe('10px');
    expect(bundledMood('soft-serve-gray')!.theme.section).toBe('Light');
    expect(bundledMood('soft-serve-black')!.theme.section).toBe('Dark');
    expect(BUNDLED_MOODS.at(-2)?.id).toBe('soft-serve-gray');
    expect(BUNDLED_MOODS.at(-1)?.id).toBe('soft-serve-black');
  });
});
