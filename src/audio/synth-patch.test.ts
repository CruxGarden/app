import { describe, it, expect } from 'vitest';
import {
  parseSynthPatch,
  parseSynthPresets,
  synthPreset,
  synthForMood,
  synthPresetsForMood,
} from './synth-patch';
import { initServices } from '@/services';
import { runThemeTool } from '@/ai/theme-tools';
import { createToolExecutor } from '@/ai/tools';
import { getSynth, getSynthPresets } from '@/services/sound';
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
      { ...synthPreset('glow'), space: NaN },
      { ...synthPreset('glow'), tempo: 0 },
      { ...synthPreset('glow'), mode: 'unknown' },
    ])
      expect(() => parseSynthPatch(bad)).toThrow();
    const patch = synthPreset('glow');
    patch.tracks[0]!.level = NaN;
    expect(() => parseSynthPatch(patch)).toThrow(/level/);
    expect(() => synthPreset('missing')).toThrow();
  });
  it('migrates original patches and gives long-named Moods distinct bounded preset banks', () => {
    const { mode: _mode, tempo: _tempo, space: _space, ...legacy } = synthPreset('glow');
    expect(parseSynthPatch(legacy)).toMatchObject({ mode: 'major', tempo: 54, space: 0.6 });
    expect(parseSynthPresets(synthPresetsForMood('custom', 'A'.repeat(100)))).toHaveLength(3);
    expect(() => parseSynthPresets(Array(33).fill(synthPreset('glow')))).toThrow();
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
    const result = await execute('set_synth', { patch, volume: 0.3, savePreset: 'My night music' });
    expect(getSynthPresets().find((p) => p.name === 'My night music')).toEqual({
      ...patch,
      name: 'My night music',
    });
    expect(JSON.stringify(result)).toContain('Quiet dusk');
    expect(getSynth()).toEqual(patch);
    expect(await runThemeTool('set_synth', { preset: 'prism', volume: 2 })).toContain(
      'volume must',
    );
    expect(getSynth()).toEqual(patch);
    const bank = getSynthPresets();
    expect(await runThemeTool('set_synth', { preset: 'prism', savePreset: '' })).toContain('name');
    expect(getSynth()).toEqual(patch);
    expect(getSynthPresets()).toEqual(bank);
    const pkg = await captureCurrentMood({ name: 'Sound test' });
    expect(validateMoodPackage(JSON.parse(JSON.stringify(pkg)))?.sound.synth).toEqual(patch);
    const archive = await exportMoodPackage(pkg, async () => new Uint8Array());
    const imported = await importMoodPackage(await archive.arrayBuffer(), async () => 'unused');
    expect(imported?.sound.synth).toEqual(patch);
    expect(imported?.sound.synthPresets).toEqual(bank);
    expect(
      validateMoodPackage({ ...pkg, sound: { ...pkg.sound, synth: { ...patch, root: 10000 } } }),
    ).toBeNull();
  });
});
