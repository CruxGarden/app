import { describe, it, expect, beforeEach } from 'vitest';
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
import * as resonance from '@/services/resonance';
import { createLayer } from '@/audio/schema';

describe('Mood Packages', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.MoodPackages, '');
    setSetting(SettingsKey.ResonanceMixes, '');
  });

  it('captures the current look and validates its own output', () => {
    const pkg = captureCurrentMood({ name: 'Night Shift', author: 'daniel' });
    expect(pkg.id).toBe('mood-night-shift');
    expect(pkg.theme.format).toBe('crux-mood-theme');
    expect(pkg.resonance.mixes.length).toBeGreaterThan(0);
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
    const mixes = resonance.getMixes();
    mixes[0]!.layers.push(
      createLayer('music', { params: { fingerprint: 'abc123', fileName: 'bed.mp3' } }),
    );
    resonance.saveMixes(mixes);
    const pkg = captureCurrentMood({ name: 'With Music', cover: 'cover9' });
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
    expect(back?.resonance.mixes[0]?.layers.at(-1)?.params.fingerprint).toBe('abc123');
    expect(written.map((w) => w.length).sort()).toEqual([2, 3]);

    // audio can be left out of an export
    const noAudio = await exportMoodPackage(pkg, async (fp) => store.get(fp)!, {
      includeAudio: false,
    });
    const back2 = await importMoodPackage(await noAudio.arrayBuffer(), async () => 'x');
    expect(back2?.name).toBe('With Music');
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

  it('applyMood saves copies of the bundled mixes, not the package objects', async () => {
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
      const pkg = bundledMood('rainy-day-cafe')!;
      await applyMood(pkg);
      const persona = getPersona();
      expect(persona.name).toBe(pkg.persona!.name);
      expect(persona.thumbnailFingerprint).toBe('dark-fp');
      expect(persona.thumbnailFingerprintLight).toBe('light-fp');

      const stored = useAudioStore
        .getState()
        .mixes.find((m) => m.id === pkg.resonance.activeMixId)!;
      const inPackage = pkg.resonance.mixes.find((m) => m.id === pkg.resonance.activeMixId)!;
      expect(stored).toEqual(inPackage);
      expect(stored).not.toBe(inPackage);
      expect(stored.layers[0]).not.toBe(inPackage.layers[0]);
      // mutating what the store holds cannot reach the bundled package
      stored.layers[0]!.params.intensity = 0;
      expect(inPackage.layers[0]!.params.intensity).not.toBe(0);
    } finally {
      if (hadWindow) delete g.window;
      else delete g.window;
    }
  });
});
