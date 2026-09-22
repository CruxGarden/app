import { describe, it, expect } from 'vitest';
import { parseSynthPatch, synthPreset, synthForMood } from './synth-patch';
import { initServices } from '@/services';
import { runThemeTool } from '@/ai/theme-tools';
import { createToolExecutor } from '@/ai/tools';
import { getSynth } from '@/services/sound';
import {
  captureCurrentMood,
  validateMoodPackage,
  exportMoodPackage,
  importMoodPackage,
} from '@/lib/moods/packages';

describe('Crux Synth controls', () => {
  it('rejects malformed, unbounded and non-finite controls before reaching audio', () => {
    for (const bad of [
      null,
      {},
      { ...synthPreset('glow'), tracks: [] },
      { ...synthPreset('glow'), root: Infinity },
    ])
      expect(() => parseSynthPatch(bad)).toThrow();
    const patch = synthPreset('glow');
    patch.tracks[0]!.level = NaN;
    expect(() => parseSynthPatch(patch)).toThrow(/level/);
    expect(() => synthPreset('missing')).toThrow();
  });
  it('gives Moods reproducible editable presets without sharing mutable objects', () => {
    const first = synthForMood('plasma', 'Plasma');
    expect(first).toEqual(synthForMood('plasma', 'Plasma'));
    expect(first).not.toEqual(synthForMood('sage', 'Sage'));
    first.tracks[0]!.muted = true;
    expect(synthForMood('plasma', 'Plasma').tracks[0]!.muted).toBe(false);
  });
  it('agent controls persist the same patch, reject invalid edits atomically, and carry it in Moods', async () => {
    await initServices();
    const patch = synthPreset('dusk');
    patch.tracks[2]!.muted = true;
    const execute = createToolExecutor('fixture');
    const result = await execute('set_synth', { patch, volume: 0.3 });
    expect(JSON.stringify(result)).toContain('Quiet dusk');
    expect(getSynth()).toEqual(patch);
    expect(await runThemeTool('set_synth', { preset: 'prism', volume: 2 })).toContain(
      'volume must',
    );
    expect(getSynth()).toEqual(patch);
    const pkg = await captureCurrentMood({ name: 'Sound test' });
    expect(validateMoodPackage(JSON.parse(JSON.stringify(pkg)))?.sound.synth).toEqual(patch);
    const archive = await exportMoodPackage(pkg, async () => new Uint8Array());
    const imported = await importMoodPackage(await archive.arrayBuffer(), async () => 'unused');
    expect(imported?.sound.synth).toEqual(patch);
    expect(
      validateMoodPackage({ ...pkg, sound: { ...pkg.sound, synth: { ...patch, root: 10000 } } }),
    ).toBeNull();
  });
});
