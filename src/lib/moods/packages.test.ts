import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  captureCurrentMood,
  validateMoodPackage,
  exportMoodPackage,
  importMoodPackage,
  installMood,
  getInstalledMoods,
  deleteMood,
  packageAssets,
  personaForApply,
  applyMood,
} from './packages';
import { bundledMood } from './bundled-moods';
import { getPersona, savePersona } from '@/services/persona';
import { useAudioStore } from '@/stores/audioStore';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import * as sound from '@/services/sound';

describe('Mood Packages', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.MoodPackages, '');
    setSetting(SettingsKey.SoundTrack, '');
  });

  it('captures the current look and validates its own output', () => {
    const pkg = captureCurrentMood({ name: 'Night Shift', author: 'daniel' });
    expect(pkg.id).toBe('mood-night-shift');
    expect(pkg.theme.format).toBe('crux-mood-theme');
    expect(pkg.sound).toMatchObject({ track: null, enabled: true });
    expect(pkg.sound.volume).toBeGreaterThan(0);
    expect(pkg.persona?.name).toBeTruthy();
    expect(validateMoodPackage(JSON.parse(JSON.stringify(pkg)))).toEqual(pkg);
    expect(validateMoodPackage({ format: 'nope' })).toBeNull();
  });

  it('installs, lists, replaces by id, deletes', () => {
    installMood(captureCurrentMood({ name: 'A' }));
    installMood(captureCurrentMood({ name: 'B' }));
    installMood(captureCurrentMood({ name: 'A' }));
    expect(getInstalledMoods().map((m) => m.name)).toEqual(['B', 'A']);
    deleteMood('mood-a');
    expect(getInstalledMoods().map((m) => m.name)).toEqual(['B']);
  });

  it('exports a .cruxmood with referenced assets and imports it back', async () => {
    sound.setTrack({ fingerprint: 'abc123', name: 'Bed', type: 'audio/mpeg' });
    const pkg = captureCurrentMood({ name: 'With Music', cover: 'cover9' });
    expect(pkg.sound.track).toEqual({ fingerprint: 'abc123', name: 'Bed', type: 'audio/mpeg' });
    expect(packageAssets(pkg)).toEqual(expect.arrayContaining(['cover9', 'abc123']));

    const store = new Map<string, Uint8Array>([
      ['abc123', new Uint8Array([1, 2, 3])],
      ['cover9', new Uint8Array([9, 9])],
    ]);
    const zip = await exportMoodPackage(pkg, async (fp) => {
      const b = store.get(fp);
      if (!b) throw new Error('missing');
      return b;
    });
    const written: Uint8Array[] = [];
    const back = await importMoodPackage(await zip.arrayBuffer(), async (bytes) => {
      written.push(bytes);
      return 'fp';
    });
    expect(back?.name).toBe('With Music');
    expect(back?.sound.track?.fingerprint).toBe('abc123');
    expect(written.map((w) => w.length).sort()).toEqual([2, 3]);

    // audio can be left out of an export
    const noAudio = await exportMoodPackage(pkg, async (fp) => store.get(fp)!, {
      includeAudio: false,
    });
    const back2 = await importMoodPackage(await noAudio.arrayBuffer(), async () => 'x');
    expect(back2?.name).toBe('With Music');
  });

  it('exports a bundled background before apply and retains its cues without changing the worn Mood', async () => {
    const pkg = bundledMood('raster-bars')!;
    const before = captureCurrentMood({ name: 'Before' });
    const original = structuredClone(pkg);
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(bytes)));
    try {
      const zip = await exportMoodPackage(pkg, async () => {
        throw new Error('not stored');
      });
      const written: Uint8Array[] = [];
      const back = await importMoodPackage(await zip.arrayBuffer(), async (data) => {
        written.push(data);
        return 'stored';
      });
      expect(written).toEqual([bytes]);
      expect(back?.background.image).toMatch(/^[a-f0-9]{64}$/);
      expect(back?.sound.cues.snapshot).toBe('coin');
      expect(back?.bundled).toBeUndefined();
      expect(pkg).toEqual(original);
      expect(captureCurrentMood({ name: 'Before' }).theme).toEqual(before.theme);
      expect(getPersona()).toEqual(before.persona);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('applying a Mood keeps the user avatars unless the package brings its own', () => {
    const mine = {
      name: 'Me',
      greeting: 'hi',
      systemPrompt: 'be me',
      thumbnailFingerprint: 'dark-fp',
      thumbnailFingerprintLight: 'light-fp',
    };
    // bundled shape: voice only
    const voice = personaForApply(mine, { name: 'Barista', greeting: 'hey', systemPrompt: 'warm' });
    expect(voice).toEqual({ ...mine, name: 'Barista', greeting: 'hey', systemPrompt: 'warm' });
    // explicit nulls (a captured persona with no avatar) do not wipe the user's
    expect(
      personaForApply(mine, {
        name: 'X',
        greeting: '',
        systemPrompt: '',
        thumbnailFingerprint: null,
      }).thumbnailFingerprint,
    ).toBe('dark-fp');
    // a package with its own avatars replaces them
    expect(
      personaForApply(mine, {
        name: 'X',
        greeting: '',
        systemPrompt: '',
        thumbnailFingerprint: 'pkg',
      }),
    ).toMatchObject({ thumbnailFingerprint: 'pkg', thumbnailFingerprintLight: 'light-fp' });
  });

  it("applyMood wears a bundled Mood: voice from the package, the user's avatars kept, sound settings taken", async () => {
    // savePersona and the theme store touch window; the node env has none
    const g = globalThis as { window?: unknown };
    const hadWindow = 'window' in g;
    g.window = {
      dispatchEvent: () => true,
      matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    };
    try {
      savePersona({
        name: 'Me',
        greeting: 'hi',
        systemPrompt: 'be me',
        thumbnailFingerprint: 'dark-fp',
        thumbnailFingerprintLight: 'light-fp',
      });
      const pkg = bundledMood('general-store')!;
      await applyMood(pkg);
      const persona = getPersona();
      expect(persona.name).toBe(pkg.persona!.name);
      expect(persona.thumbnailFingerprint).toBe('dark-fp');
      expect(persona.thumbnailFingerprintLight).toBe('light-fp');
      expect(useAudioStore.getState().volume).toBe(pkg.sound.volume);
      expect(useAudioStore.getState().track).toBeNull(); // General Store is quiet
      expect(sound.getEnabled()).toBe(true);
    } finally {
      if (hadWindow) delete g.window;
      else delete g.window;
    }
  });

  it('reads a package saved before sound was a track: the old resonance block gives volume and cues', () => {
    const legacy = {
      format: 'crux-mood',
      version: 1,
      id: 'old',
      name: 'Old',
      created: '2026-09-03T00:00:00.000Z',
      theme: { format: 'crux-mood-theme', version: 1, name: 'Old', section: 'Dark', overrides: {} },
      background: { type: 'bloom' },
      resonance: {
        mixes: [{ id: 'm', name: 'Night Rain', layers: [] }],
        playlist: { enabled: false, shuffle: false, items: [] },
        cues: { message: 'chime', toolDone: null },
        activeMixId: 'm',
        volume: 0.42,
      },
    };
    const pkg = validateMoodPackage(legacy)!;
    expect(pkg.sound).toMatchObject({ track: null, volume: 0.42, enabled: true });
    expect(pkg.sound.cues.message).toBe('chime');
    expect(pkg.sound.cues.toolDone).toBeNull();
    expect((pkg as unknown as Record<string, unknown>).resonance).toBeUndefined();
  });

  it('carries schedules: validated on read, captured from the worn Mood, applied with it', async () => {
    const { useSchedules, initSchedules, SCHEDULES_KEY } = await import('@/services/schedules');
    setSetting(SCHEDULES_KEY, '[]');
    initSchedules();
    const pkg = validateMoodPackage({
      format: 'crux-mood',
      name: 'Tides',
      schedules: [
        {
          id: 'high',
          title: 'High tide',
          trigger: { kind: 'cron', expr: '0 6 * * *' },
          actions: [{ kind: 'mood', moodId: 'coral-castle' }],
          enabled: false,
        },
        { title: 'Broken', trigger: { kind: 'nope' }, actions: [{ kind: 'alert' }] },
        { title: 'Nothing to do', trigger: { kind: 'every', minutes: 5 }, actions: [] },
      ],
    })!;
    expect(pkg.schedules?.map((s) => s.id)).toEqual(['high']);
    await applyMood(pkg);
    const list = useSchedules.getState().schedules;
    expect(list.map((s) => [s.title, s.source, s.moodId, s.enabled])).toEqual([
      ['High tide', 'mood', 'mood-tides', false],
    ]);
    // Captured back out with the Mood, and gone when another Mood is worn.
    expect(captureCurrentMood({ name: 'Tides again' }).schedules).toEqual([
      { ...pkg.schedules![0], enabled: false },
    ]);
    expect(bundledMood('ember-horizon')!.schedules?.[0]).toMatchObject({
      title: 'Dusk: wear Last Light',
      actions: [{ kind: 'mood', moodId: 'last-light' }],
    });
    expect(bundledMood('last-light')!.schedules?.[0]!.actions).toEqual([
      { kind: 'mood', moodId: 'ember-horizon' },
    ]);
    await applyMood(validateMoodPackage({ format: 'crux-mood', name: 'Plain' })!);
    expect(useSchedules.getState().schedules).toEqual([]);
  });
});
