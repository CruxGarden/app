import { describe, it, expect } from 'vitest';
import { EFFECT_DEFAULTS } from './params-meta';
import {
  createLayer,
  createMix,
  validateMix,
  LAYER_TYPES,
  EFFECT_TYPES,
  LAYER_DEFAULTS,
} from './schema';
import { DEFAULT_MIXES } from './default-mixes';

describe('Mix schema', () => {
  it('ships valid default mixes with stable ids', () => {
    expect(DEFAULT_MIXES.length).toBeGreaterThanOrEqual(3);
    for (const m of DEFAULT_MIXES) {
      expect(validateMix(JSON.parse(JSON.stringify(m)))).toEqual(m);
      expect(m.id).not.toMatch(/^mix-/);
    }
  });

  it('every layer type has defaults and survives a round trip', () => {
    for (const t of LAYER_TYPES) {
      const layer = createLayer(t);
      const mix = createMix({ layers: [layer] });
      const back = validateMix(JSON.parse(JSON.stringify(mix)));
      expect(back?.layers[0]).toEqual(layer);
    }
  });

  it('drops unknown fields, clamps ranges, rejects garbage', () => {
    const back = validateMix({
      id: 'x',
      layers: [
        {
          type: 'rain',
          gain: -999,
          pan: 4,
          params: { intensity: 0.9, bogus: 1 },
          effects: [{ type: 'reverb' }, { type: 'nope' }],
        },
        { type: 'lava' },
      ],
      master: { reverbWet: 5 },
      scale: 'phrygian',
    });
    expect(back?.layers).toHaveLength(1);
    expect(back?.layers[0]?.gain).toBe(-60);
    expect(back?.layers[0]?.pan).toBe(1);
    expect(back?.layers[0]?.params.intensity).toBe(0.9);
    expect(back?.layers[0]?.params).not.toHaveProperty('bogus');
    expect(back?.layers[0]?.effects).toEqual([{ type: 'reverb', enabled: true, params: {} }]);
    expect(back?.master.reverbWet).toBe(1);
    expect(back?.scale).toBe('pentatonic');
    expect(validateMix(null)).toBeNull();
    expect(validateMix({ name: 'no layers' })).toBeNull();
  });

  it('every effect type validates with its defaults and unknown effects are dropped', () => {
    const layer = createLayer('keys', {
      effects: EFFECT_TYPES.map((t) => ({
        type: t,
        enabled: true,
        params: { ...EFFECT_DEFAULTS[t] },
      })),
    });
    const mix = validateMix(createMix({ layers: [layer] }))!;
    expect(mix.layers[0]!.effects.map((e) => e.type)).toEqual(EFFECT_TYPES);
    const bad = validateMix(
      createMix({
        layers: [
          createLayer('beat', {
            effects: [{ type: 'flanger' as never, enabled: true, params: {} }],
          }),
        ],
      }),
    )!;
    expect(bad.layers[0]!.effects).toEqual([]);
    // the new instrument layers carry their musical params
    expect(LAYER_DEFAULTS.keys.progression).toBe('lofi');
    expect(LAYER_DEFAULTS.beat.pattern).toBe('lofi');
    expect(DEFAULT_MIXES.find((m) => m.id === 'lofi-study')?.layers.map((l) => l.type)).toEqual([
      'keys',
      'beat',
      'bass',
      'vinyl',
      'rain',
    ]);
  });
});
