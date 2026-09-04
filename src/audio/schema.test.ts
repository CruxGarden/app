import { describe, it, expect } from 'vitest';
import { EFFECT_DEFAULTS } from './params-meta';
import {
  createLayer,
  createMix,
  validateMix,
  isValidRoot,
  LAYER_TYPES,
  EFFECT_TYPES,
  LAYER_DEFAULTS,
  MAX_LAYERS,
  MAX_EFFECTS_PER_LAYER,
  MAX_NAME_LENGTH,
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
    const fx = EFFECT_TYPES.map((t) => ({
      type: t,
      enabled: true,
      params: { ...EFFECT_DEFAULTS[t] },
    }));
    // a layer holds MAX_EFFECTS_PER_LAYER effects, so spread the catalog over two
    const layers = [
      createLayer('keys', { effects: fx.slice(0, MAX_EFFECTS_PER_LAYER) }),
      createLayer('bass', { effects: fx.slice(MAX_EFFECTS_PER_LAYER) }),
    ];
    const mix = validateMix(createMix({ layers }))!;
    expect(mix.layers.flatMap((l) => l.effects.map((e) => e.type))).toEqual(EFFECT_TYPES);
    // defaults are inside every range, so they come back untouched
    expect(mix.layers.flatMap((l) => l.effects.map((e) => e.params))).toEqual(
      EFFECT_TYPES.map((t) => EFFECT_DEFAULTS[t]),
    );
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

  it('clamps effect params to the ranges Tone.js accepts (params-meta)', () => {
    const layer = createLayer('keys', {
      effects: [
        { type: 'bitcrusher', enabled: true, params: { bits: 100, wet: 3 } },
        { type: 'compressor', enabled: true, params: { threshold: 5, ratio: 50 } },
        { type: 'delay', enabled: true, params: { time: 5, feedback: -2, wet: 0.5 } },
        { type: 'tape', enabled: true, params: { wobble: 0.2, warmth: 3 } },
      ],
    });
    const more = createLayer('bass', {
      effects: [
        { type: 'reverb', enabled: true, params: { decay: 0, wet: 0.2 } },
        { type: 'filter', enabled: true, params: { frequency: -5, q: 0.5, kind: 'notch' } },
        { type: 'chorus', enabled: true, params: { rate: 'fast' as never, depth: 0.5 } },
        { type: 'tremolo', enabled: true, params: { rate: 99, depth: 1.5 } },
      ],
    });
    const back = validateMix(createMix({ layers: [layer, more] }))!;
    const [bits, comp, delay, tape] = back.layers[0]!.effects;
    expect(bits!.params).toEqual({ bits: 12, wet: 1 });
    expect(comp!.params).toEqual({ threshold: 0, ratio: 20 });
    expect(delay!.params).toEqual({ time: 2, feedback: 0, wet: 0.5 });
    // tape warmth > 2 would put the low-pass frequency below zero
    expect(tape!.params).toEqual({ wobble: 0.2, warmth: 1 });
    const [reverb, filter, chorus, trem] = back.layers[1]!.effects;
    expect(reverb!.params).toEqual({ decay: 0.1, wet: 0.2 });
    // an unknown select option and a string where a number belongs are dropped (engine default applies)
    expect(filter!.params).toEqual({ frequency: 40, q: 0.5 });
    expect(chorus!.params).toEqual({ depth: 0.5 });
    expect(trem!.params).toEqual({ rate: 12, depth: 1 });
    // effect params that are not an object are ignored, not spread
    expect(
      validateMix(
        createMix({
          layers: [
            createLayer('rain', {
              effects: [{ type: 'reverb', enabled: true, params: [1, 2] as never }],
            }),
          ],
        }),
      )!.layers[0]!.effects[0]!.params,
    ).toEqual({});
  });

  it('clamps layer params — octaves stay in MIDI range, selects must name an option', () => {
    const back = validateMix(
      createMix({
        layers: [
          createLayer('keys', { params: { octave: 100, instrument: 'kazoo', humanize: 7 } }),
          createLayer('bass', { params: { octave: -3 } }),
          createLayer('melody', { params: { octave: 100 } }),
          createLayer('beat', { params: { swing: 0.1 } }),
          createLayer('music', { params: { loop: 'yes' as never, rate: 9 } }),
          createLayer('drone', { params: { voices: 5, octave: 'high' as never } }),
        ],
      }),
    )!;
    const [keys, bass, melody, beat, music, drone] = back.layers;
    expect(keys!.params.octave).toBe(5);
    expect(keys!.params.instrument).toBe('rhodes');
    expect(keys!.params.humanize).toBe(1);
    expect(bass!.params.octave).toBe(1);
    expect(melody!.params.octave).toBe(7);
    expect(beat!.params.swing).toBe(0.5);
    expect(music!.params.loop).toBe(true);
    expect(music!.params.rate).toBe(1.5);
    // params the Mixer does not render are type-checked only
    expect(drone!.params.voices).toBe(5);
    expect(drone!.params.octave).toBe(2);
    expect(validateMix({ layers: [{ type: 'rain', params: [1] }] })!.layers[0]!.params).toEqual(
      LAYER_DEFAULTS.rain,
    );
  });

  it('accepts only real roots (sharps and the flat spellings harmony normalises)', () => {
    expect(isValidRoot('Eb')).toBe(true);
    expect(isValidRoot('F#')).toBe(true);
    expect(isValidRoot('H')).toBe(false);
    expect(isValidRoot('')).toBe(false);
    expect(validateMix({ layers: [], root: 'Db' })!.root).toBe('Db');
    expect(validateMix({ layers: [], root: 'H' })!.root).toBe('D');
    expect(validateMix({ layers: [], root: 12 })!.root).toBe('D');
    expect(validateMix({ layers: [], scale: 'toString' })!.scale).toBe('pentatonic');
  });

  it('caps layers, effects per layer and name length', () => {
    const many = validateMix(
      createMix({
        name: 'x'.repeat(200),
        layers: Array.from({ length: 20 }, () =>
          createLayer('rain', {
            name: 'y'.repeat(200),
            effects: Array.from({ length: 9 }, () => ({
              type: 'reverb' as const,
              enabled: true,
              params: {},
            })),
          }),
        ),
      }),
    )!;
    expect(many.name).toHaveLength(MAX_NAME_LENGTH);
    expect(many.layers).toHaveLength(MAX_LAYERS);
    expect(many.layers[0]!.name).toHaveLength(MAX_NAME_LENGTH);
    expect(many.layers[0]!.effects).toHaveLength(MAX_EFFECTS_PER_LAYER);
  });
});
