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
} from './packages';
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
});
