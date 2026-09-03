import { describe, it, expect, beforeEach } from 'vitest';
import { runThemeTool, THEME_TOOL_DEFINITIONS } from './theme-tools';
import { defaultToolDefinitions } from './tools';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useAudioStore } from '@/stores/audioStore';
import * as resonance from '@/services/resonance';

describe('resonance tools', () => {
  beforeEach(async () => {
    await initServices();
    setSetting(SettingsKey.ResonanceMixes, '');
    setSetting(SettingsKey.ResonanceActiveMix, '');
    setSetting(SettingsKey.ResonanceVolume, '');
    useAudioStore.setState({
      mixes: resonance.getMixes(),
      activeMixId: 'dusk-in-the-garden',
      volume: 0.7,
      playing: false,
      optIn: false,
    });
  });

  it('are offered alongside the theme tools', () => {
    const names = defaultToolDefinitions().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['get_resonance', 'set_resonance']));
    expect(
      THEME_TOOL_DEFINITIONS.find((t) => t.name === 'set_resonance')?.input_schema.properties,
    ).toHaveProperty('duck');
  });

  it('get_resonance describes mixes, playlist and cues', async () => {
    const out = (await runThemeTool('get_resonance', {})) as string;
    expect(out).toMatch(/never enabled/);
    expect(out).toMatch(/Dusk in the Garden \(dusk-in-the-garden\)/);
    expect(out).toMatch(/Rain\[rain -20dB\]/);
    expect(out).toMatch(/cues: .*toolDone=tick/);
  });

  it('set_resonance switches mix by name, sets volume, edits and adds layers (saved)', async () => {
    let out = (await runThemeTool('set_resonance', { mix: 'night rain', volume: 0.25 })) as string;
    expect(out).toMatch(/switched to "Night Rain"/);
    expect(out).toMatch(/volume 0.25/);
    expect(useAudioStore.getState().activeMixId).toBe('night-rain');
    expect(resonance.getVolume()).toBeCloseTo(0.25);

    out = (await runThemeTool('set_resonance', {
      layer: { name: 'Rain', gain: -6, params: { intensity: 0.9, bogus: 1 } },
    })) as string;
    expect(out).toMatch(/edited layer "Rain"/);
    const rain = resonance
      .getMixes()
      .find((m) => m.id === 'night-rain')!
      .layers.find((l) => l.name === 'Rain')!;
    expect(rain.gain).toBe(-6);
    expect(rain.params.intensity).toBe(0.9);
    expect(rain.params).not.toHaveProperty('bogus');

    out = (await runThemeTool('set_resonance', {
      addLayer: { type: 'pad', name: 'Halo', gain: -20 },
      removeLayer: 'Wind',
    })) as string;
    expect(out).toMatch(/added pad layer "Halo"/);
    expect(out).toMatch(/removed layer "Wind"/);
    const names = resonance
      .getMixes()
      .find((m) => m.id === 'night-rain')!
      .layers.map((l) => l.name);
    expect(names).toContain('Halo');
    expect(names).not.toContain('Wind');

    out = (await runThemeTool('set_resonance', {
      mix: 'Nope',
      playing: true,
      cue: 'chime',
    })) as string;
    expect(out).toMatch(/no mix "Nope"/);
    expect(out).toMatch(/never been enabled/);
    expect(out).toMatch(/cue skipped/);
    expect(await runThemeTool('set_resonance', {})).toMatch(/nothing to do/);
  });
});
