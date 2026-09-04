/** How the Mixer renders each parameter — the UI's knowledge of the layer types. */
import type { EffectType, LayerType } from './schema';

export type ParamMeta =
  | { kind: 'range'; label: string; min: number; max: number; step: number; unit?: string }
  | { kind: 'select'; label: string; options: { value: string; label: string }[] }
  | { kind: 'toggle'; label: string }
  | { kind: 'file'; label: string };

const pct = (label: string): ParamMeta => ({ kind: 'range', label, min: 0, max: 1, step: 0.01 });
const waveforms = [
  'sine',
  'triangle',
  'sawtooth',
  'square',
  'fatsine',
  'fatsawtooth',
  'fattriangle',
].map((v) => ({ value: v, label: v }));

export const PARAM_META: Record<LayerType, Record<string, ParamMeta>> = {
  music: {
    fingerprint: { kind: 'file', label: 'Audio file' },
    loop: { kind: 'toggle', label: 'Loop' },
    rate: { kind: 'range', label: 'Speed', min: 0.5, max: 1.5, step: 0.01, unit: '×' },
    fadeIn: { kind: 'range', label: 'Fade in', min: 0, max: 10, step: 0.1, unit: 's' },
    fadeOut: { kind: 'range', label: 'Fade out', min: 0, max: 10, step: 0.1, unit: 's' },
  },
  rain: { intensity: pct('Intensity'), brightness: pct('Brightness'), drops: pct('Drops') },
  wind: { strength: pct('Strength'), gust: pct('Gust'), height: pct('Height') },
  noise: {
    color: {
      kind: 'select',
      label: 'Colour',
      options: [
        { value: 'white', label: 'White' },
        { value: 'pink', label: 'Pink' },
        { value: 'brown', label: 'Brown' },
      ],
    },
    cutoff: pct('Cutoff'),
    drift: pct('Drift'),
  },
  drone: {
    waveform: { kind: 'select', label: 'Waveform', options: waveforms },
    chord: {
      kind: 'select',
      label: 'Voicing',
      options: [
        { value: 'root', label: 'Root only' },
        { value: 'root5', label: 'Root + fifth' },
        { value: 'root5oct', label: 'Root + fifth + octave' },
        { value: 'minor7', label: 'Minor seventh' },
      ],
    },
    octave: { kind: 'range', label: 'Octave', min: 0, max: 4, step: 1 },
    cutoff: pct('Cutoff'),
    movement: pct('Movement'),
  },
  pad: {
    waveform: { kind: 'select', label: 'Waveform', options: waveforms },
    octave: { kind: 'range', label: 'Octave', min: 2, max: 5, step: 1 },
    attack: { kind: 'range', label: 'Attack', min: 0.1, max: 12, step: 0.1, unit: 's' },
    release: { kind: 'range', label: 'Release', min: 0.5, max: 20, step: 0.1, unit: 's' },
    shimmer: pct('Shimmer'),
    changeEvery: { kind: 'range', label: 'Change every', min: 1, max: 32, step: 1, unit: ' bars' },
  },
  melody: {
    instrument: { kind: 'select', label: 'Instrument', options: waveforms.slice(0, 4) },
    octave: { kind: 'range', label: 'Octave', min: 3, max: 7, step: 1 },
    density: pct('Density'),
    humanize: pct('Humanize'),
    echo: pct('Echo'),
  },
  sample: {
    fingerprint: { kind: 'file', label: 'Audio file' },
    loop: { kind: 'toggle', label: 'Loop' },
    rate: { kind: 'range', label: 'Speed', min: 0.25, max: 2, step: 0.01, unit: '×' },
  },
  beat: {
    pattern: {
      kind: 'select',
      label: 'Pattern',
      options: [
        { value: 'lofi', label: 'Lofi (laid back)' },
        { value: 'boombap', label: 'Boom bap' },
        { value: 'half', label: 'Half-time' },
        { value: 'four', label: 'Four on the floor' },
        { value: 'brush', label: 'Brushes' },
      ],
    },
    density: pct('Density'),
    /** 0.5 is straight; a hit cannot be scheduled before its own slot, so there is no "early" swing */
    swing: { kind: 'range', label: 'Swing', min: 0.5, max: 1, step: 0.01 },
    hats: pct('Hats'),
    tone: pct('Tone'),
    humanize: pct('Humanize'),
  },
  keys: {
    instrument: {
      kind: 'select',
      label: 'Instrument',
      options: [
        { value: 'rhodes', label: 'Rhodes' },
        { value: 'piano', label: 'Piano' },
        { value: 'organ', label: 'Organ' },
        { value: 'bells', label: 'Bells' },
        { value: 'guitar', label: 'Guitar' },
      ],
    },
    progression: {
      kind: 'select',
      label: 'Progression',
      options: [
        { value: 'lofi', label: 'ii – V – I' },
        { value: 'pop', label: 'I – vi – IV – V' },
        { value: 'axis', label: 'I – V – vi – IV' },
        { value: 'minor', label: 'i – VII – VI – VII' },
        { value: 'gospel', label: 'I – IV – V – I' },
        { value: 'jazz', label: 'ii – V – I – vi' },
        { value: 'wistful', label: 'I – iii – IV – vi' },
        { value: 'static', label: 'One chord' },
      ],
    },
    voicing: {
      kind: 'select',
      label: 'Voicing',
      options: [
        { value: 'triad', label: 'Triads' },
        { value: 'seventh', label: 'Sevenths' },
      ],
    },
    rhythm: {
      kind: 'select',
      label: 'Rhythm',
      options: [
        { value: 'whole', label: 'Whole notes' },
        { value: 'half', label: 'Half notes' },
        { value: 'stabs', label: 'Stabs' },
        { value: 'arp', label: 'Arpeggio' },
      ],
    },
    octave: { kind: 'range', label: 'Octave', min: 2, max: 5, step: 1 },
    humanize: pct('Humanize'),
    wobble: pct('Wobble'),
    tone: pct('Tone'),
  },
  bass: {
    pattern: {
      kind: 'select',
      label: 'Pattern',
      options: [
        { value: 'root', label: 'Root notes' },
        { value: 'pulse', label: 'Pulse' },
        { value: 'walk', label: 'Walking' },
      ],
    },
    progression: {
      kind: 'select',
      label: 'Progression',
      options: [
        { value: 'lofi', label: 'ii – V – I' },
        { value: 'pop', label: 'I – vi – IV – V' },
        { value: 'axis', label: 'I – V – vi – IV' },
        { value: 'minor', label: 'i – VII – VI – VII' },
        { value: 'gospel', label: 'I – IV – V – I' },
        { value: 'jazz', label: 'ii – V – I – vi' },
        { value: 'wistful', label: 'I – iii – IV – vi' },
        { value: 'static', label: 'One chord' },
      ],
    },
    octave: { kind: 'range', label: 'Octave', min: 1, max: 3, step: 1 },
    tone: pct('Tone'),
    glide: pct('Glide'),
  },
  vinyl: { crackle: pct('Crackle'), dust: pct('Dust'), hum: pct('Hum') },
};

export const EFFECT_META: Record<EffectType, { label: string; params: Record<string, ParamMeta> }> =
  {
    filter: {
      label: 'Filter',
      params: {
        kind: {
          kind: 'select',
          label: 'Type',
          options: [
            { value: 'lowpass', label: 'Low-pass' },
            { value: 'highpass', label: 'High-pass' },
            { value: 'bandpass', label: 'Band-pass' },
          ],
        },
        frequency: {
          kind: 'range',
          label: 'Frequency',
          min: 40,
          max: 12000,
          step: 10,
          unit: ' Hz',
        },
        q: { kind: 'range', label: 'Resonance', min: 0.1, max: 12, step: 0.1 },
      },
    },
    delay: {
      label: 'Delay',
      params: {
        time: { kind: 'range', label: 'Time', min: 0.02, max: 2, step: 0.01, unit: 's' },
        feedback: pct('Feedback'),
        wet: pct('Mix'),
      },
    },
    reverb: {
      label: 'Reverb',
      params: {
        decay: { kind: 'range', label: 'Decay', min: 0.1, max: 20, step: 0.1, unit: 's' },
        wet: pct('Mix'),
      },
    },
    chorus: {
      label: 'Chorus',
      params: {
        rate: { kind: 'range', label: 'Rate', min: 0.05, max: 6, step: 0.05, unit: ' Hz' },
        depth: pct('Depth'),
        wet: pct('Mix'),
      },
    },
    tremolo: {
      label: 'Tremolo',
      params: {
        rate: { kind: 'range', label: 'Rate', min: 0.1, max: 12, step: 0.1, unit: ' Hz' },
        depth: pct('Depth'),
      },
    },
    tape: {
      label: 'Tape',
      params: { wobble: pct('Wobble'), warmth: pct('Warmth') },
    },
    bitcrusher: {
      label: 'Bitcrusher',
      params: {
        bits: { kind: 'range', label: 'Bits', min: 2, max: 12, step: 1 },
        wet: pct('Mix'),
      },
    },
    compressor: {
      label: 'Compressor',
      params: {
        threshold: { kind: 'range', label: 'Threshold', min: -60, max: 0, step: 1, unit: ' dB' },
        ratio: { kind: 'range', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1' },
      },
    },
  };

export const EFFECT_DEFAULTS: Record<EffectType, Record<string, number | string>> = {
  filter: { kind: 'lowpass', frequency: 1200, q: 1 },
  delay: { time: 0.35, feedback: 0.35, wet: 0.3 },
  reverb: { decay: 3, wet: 0.3 },
  chorus: { rate: 0.6, depth: 0.5, wet: 0.4 },
  tremolo: { rate: 2, depth: 0.5 },
  tape: { wobble: 0.3, warmth: 0.4 },
  bitcrusher: { bits: 8, wet: 0.3 },
  compressor: { threshold: -18, ratio: 3 },
};

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
