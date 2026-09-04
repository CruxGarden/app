import { describe, it, expect, beforeEach } from 'vitest';
import { runThemeTool, THEME_TOOL_DEFINITIONS } from './theme-tools';
import { defaultToolDefinitions } from './tools';
import { initServices } from '@/services';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { useAudioStore } from '@/stores/audioStore';
import * as resonance from '@/services/resonance';
import { MAX_LAYERS, MAX_EFFECTS_PER_LAYER, MAX_NAME_LENGTH } from '@/audio/schema';

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
    expect(out).toMatch(/Rain\[rain -20dB/);
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

  const activeMix = () => {
    const st = useAudioStore.getState();
    return st.mixes.find((m) => m.id === st.activeMixId)!;
  };

  it('updateMix refuses an unknown scale or root instead of silently substituting', async () => {
    const before = activeMix();
    let out = (await runThemeTool('set_resonance', {
      updateMix: { scale: 'phrygian' },
    })) as string;
    expect(out).toMatch(/unknown scale "phrygian"/);
    expect(activeMix().scale).toBe(before.scale);
    expect(resonance.getMixes().find((m) => m.id === before.id)!.scale).toBe(before.scale);

    out = (await runThemeTool('set_resonance', { updateMix: { root: 'H', tempo: 72 } })) as string;
    expect(out).toMatch(/unknown root "H"/);
    expect(activeMix().root).toBe(before.root);
    // the valid part of the same call still lands
    expect(activeMix().tempo).toBe(72);

    out = (await runThemeTool('set_resonance', {
      updateMix: { root: 'Eb', scale: 'dorian' },
    })) as string;
    expect(out).toMatch(/updated .*\(Eb dorian/);
    expect(activeMix().root).toBe('Eb');
    expect(activeMix().scale).toBe('dorian');
  });

  it('createMix validates the key and clamps params before anything is saved', async () => {
    const out = (await runThemeTool('set_resonance', {
      createMix: {
        name: 'Odd',
        root: 'X',
        scale: 'blues',
        layers: [
          {
            type: 'keys',
            params: { octave: 100, instrument: 'kazoo' },
            effects: [{ type: 'bitcrusher', params: { bits: 64 } }],
          },
        ],
      },
    })) as string;
    expect(out).toMatch(/composed "Odd" \(D pentatonic/);
    expect(out).toMatch(/unknown root "X"/);
    expect(out).toMatch(/unknown scale "blues"/);
    const keys = activeMix().layers[0]!;
    expect(keys.params.octave).toBe(5);
    expect(keys.params.instrument).toBe('rhodes');
    expect(keys.effects[0]!.params.bits).toBe(12);
    const saved = resonance.getMixes().find((m) => m.id === activeMix().id)!;
    expect(saved.layers[0]!.params.octave).toBe(5);
  });

  it('caps layers, effects and names, and ignores params that are not objects', async () => {
    const out = (await runThemeTool('set_resonance', {
      createMix: {
        name: 'n'.repeat(300),
        layers: [
          ...Array.from({ length: MAX_LAYERS + 8 }, () => ({ type: 'rain', params: [1, 2] })),
          {
            type: 'keys',
            name: 'k'.repeat(300),
            params: 'loud',
            effects: Array.from({ length: MAX_EFFECTS_PER_LAYER + 3 }, () => ({
              type: 'reverb',
              params: [9],
            })),
          },
        ],
      },
    })) as string;
    expect(out).toMatch(new RegExp(`at most ${MAX_LAYERS} layers`));
    expect(out).toMatch(/mix name shortened/);
    const mix = activeMix();
    expect(mix.name).toHaveLength(MAX_NAME_LENGTH);
    expect(mix.layers).toHaveLength(MAX_LAYERS);
    expect(mix.layers.every((l) => l.type === 'rain')).toBe(true);
    expect(mix.layers[0]!.params).toEqual({ intensity: 0.5, brightness: 0.5, drops: 0.4 });

    // the mix is full: addLayer is refused, not silently truncated
    let more = (await runThemeTool('set_resonance', { addLayer: { type: 'vinyl' } })) as string;
    expect(more).toMatch(new RegExp(`already has ${MAX_LAYERS} layers`));
    expect(activeMix().layers).toHaveLength(MAX_LAYERS);

    // effects per layer and layer names are capped on edit too
    // (addLayer runs before removeLayer inside one call, so free a slot first)
    await runThemeTool('set_resonance', { removeLayer: 'Rain' });
    expect(activeMix().layers).toHaveLength(MAX_LAYERS - 1);
    more = (await runThemeTool('set_resonance', {
      addLayer: {
        type: 'keys',
        name: 'k'.repeat(300),
        params: 'loud',
        effects: Array.from({ length: MAX_EFFECTS_PER_LAYER + 3 }, () => ({
          type: 'reverb',
          params: [9],
        })),
      },
    })) as string;
    expect(more).toMatch(/layer name shortened/);
    expect(more).toMatch(new RegExp(`only the first ${MAX_EFFECTS_PER_LAYER} effects`));
    const keys = activeMix().layers.at(-1)!;
    expect(keys.type).toBe('keys');
    expect(keys.name).toHaveLength(MAX_NAME_LENGTH);
    expect(keys.effects).toHaveLength(MAX_EFFECTS_PER_LAYER);
    expect(keys.effects[0]!.params).toEqual({ decay: 3, wet: 0.3 });
    expect(keys.params.instrument).toBe('rhodes');
  });

  it('reports an engine failure to the model instead of throwing', async () => {
    const original = useAudioStore.getState().upsertMix;
    useAudioStore.setState({
      upsertMix: async () => {
        throw new RangeError('Value must be within [1, 16], got: 64');
      },
    });
    try {
      const out = (await runThemeTool('set_resonance', {
        addLayer: { type: 'vinyl' },
      })) as string;
      expect(out).toMatch(/set_resonance: failed — Value must be within/);
    } finally {
      useAudioStore.setState({ upsertMix: original });
    }
  });
});
