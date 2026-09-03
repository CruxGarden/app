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
  };

export const EFFECT_DEFAULTS: Record<EffectType, Record<string, number | string>> = {
  filter: { kind: 'lowpass', frequency: 1200, q: 1 },
  delay: { time: 0.35, feedback: 0.35, wet: 0.3 },
  reverb: { decay: 3, wet: 0.3 },
  chorus: { rate: 0.6, depth: 0.5, wet: 0.4 },
  tremolo: { rate: 2, depth: 0.5 },
};

export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
