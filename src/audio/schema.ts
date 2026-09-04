/**
 * Resonance Sound Mixer — the document model.
 *
 * A Mix is JSON: layers through effects into a master bus. Everything the
 * engine can do is a parameter here, so the Mixer UI, the AI's set_resonance,
 * and a .cruxmood package all speak the same shape. Hand-validated (no schema
 * library): unknown fields are dropped, missing ones take defaults, and every
 * parameter the Mixer knows (params-meta.ts) is clamped to its range — Tone.js
 * Params throw RangeError on out-of-range values, so nothing unclamped may
 * reach the engine or be persisted.
 */
import { EFFECT_META, PARAM_META, ROOTS, type ParamMeta } from './params-meta';

export type LayerType =
  | 'music'
  | 'rain'
  | 'wind'
  | 'noise'
  | 'drone'
  | 'pad'
  | 'melody'
  | 'sample'
  | 'beat'
  | 'keys'
  | 'bass'
  | 'vinyl';

export type EffectType =
  | 'filter'
  | 'delay'
  | 'reverb'
  | 'chorus'
  | 'tremolo'
  | 'tape'
  | 'bitcrusher'
  | 'compressor';

export interface Effect {
  type: EffectType;
  enabled: boolean;
  /** Effect-specific: filter {frequency, q, kind}, delay {time, feedback, wet}, reverb {decay, wet}, chorus {rate, depth, wet}, tremolo {rate, depth}, tape {wobble, warmth}, bitcrusher {bits, wet}, compressor {threshold, ratio} */
  params: Record<string, number | string>;
}

export interface Layer {
  id: string;
  type: LayerType;
  name: string;
  /** dB, -60..+6 */
  gain: number;
  /** -1..1 */
  pan: number;
  muted: boolean;
  params: Record<string, number | string | boolean>;
  effects: Effect[];
}

export interface Mix {
  id: string;
  name: string;
  /** Musical root, e.g. "D" */
  root: string;
  /** Scale name: major | minor | dorian | pentatonic | lydian */
  scale: string;
  /** BPM for the melody/pad clock */
  tempo: number;
  seed: number;
  layers: Layer[];
  master: { reverbDecay: number; reverbWet: number; volume: number };
}

export const LAYER_TYPES: LayerType[] = [
  'music',
  'rain',
  'wind',
  'noise',
  'drone',
  'pad',
  'melody',
  'sample',
  'beat',
  'keys',
  'bass',
  'vinyl',
];

export const EFFECT_TYPES: EffectType[] = [
  'filter',
  'delay',
  'reverb',
  'chorus',
  'tremolo',
  'tape',
  'bitcrusher',
  'compressor',
];
export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

/** What each layer type means by "params", with defaults. */
export const LAYER_DEFAULTS: Record<LayerType, Record<string, number | string | boolean>> = {
  music: { fingerprint: '', fileName: '', loop: true, rate: 1, fadeIn: 2, fadeOut: 2 },
  rain: { intensity: 0.5, brightness: 0.5, drops: 0.4 },
  wind: { strength: 0.5, gust: 0.4, height: 0.5 },
  noise: { color: 'brown', drift: 0.3, cutoff: 0.5 },
  drone: {
    waveform: 'fatsawtooth',
    voices: 3,
    detune: 18,
    cutoff: 0.35,
    movement: 0.3,
    octave: 2,
    chord: 'root5',
  },
  pad: { waveform: 'triangle', attack: 3, release: 6, shimmer: 0.3, octave: 3, changeEvery: 8 },
  melody: { instrument: 'sine', density: 0.25, octave: 5, humanize: 0.3, echo: 0.4 },
  sample: { fingerprint: '', fileName: '', loop: true, rate: 1 },
  beat: { pattern: 'lofi', density: 0.7, swing: 0.55, tone: 0.5, hats: 0.6, humanize: 0.4 },
  keys: {
    instrument: 'rhodes',
    progression: 'lofi',
    voicing: 'seventh',
    rhythm: 'half',
    octave: 4,
    humanize: 0.4,
    wobble: 0.3,
    tone: 0.55,
  },
  bass: { pattern: 'root', progression: 'lofi', octave: 2, tone: 0.4, glide: 0.2 },
  vinyl: { crackle: 0.5, dust: 0.4, hum: 0.15 },
};

export const LAYER_LABELS: Record<LayerType, string> = {
  music: 'Music',
  rain: 'Rain',
  wind: 'Wind',
  noise: 'Noise',
  drone: 'Drone',
  pad: 'Pad',
  melody: 'Melody',
  sample: 'Sample',
  beat: 'Beat',
  keys: 'Keys',
  bass: 'Bass',
  vinyl: 'Vinyl',
};

/** Flat spellings harmony.ts normalises to the sharp names in ROOTS. */
const FLAT_ROOTS = ['Db', 'Eb', 'Gb', 'Ab', 'Bb'];
export function isValidRoot(v: unknown): v is string {
  return typeof v === 'string' && (ROOTS.includes(v) || FLAT_ROOTS.includes(v));
}
export function isValidScale(v: unknown): v is string {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(SCALES, v);
}

/** Hard limits on document size — the tools warn, the validator trims silently. */
export const MAX_LAYERS = 12;
export const MAX_EFFECTS_PER_LAYER = 4;
export const MAX_NAME_LENGTH = 80;

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function createLayer(type: LayerType, over: Partial<Layer> = {}): Layer {
  return {
    id: newId(type),
    type,
    name: LAYER_LABELS[type],
    gain: -12,
    pan: 0,
    muted: false,
    params: { ...LAYER_DEFAULTS[type] },
    effects: [],
    ...over,
    ...(over.params ? { params: { ...LAYER_DEFAULTS[type], ...over.params } } : {}),
  };
}

export function createMix(over: Partial<Mix> = {}): Mix {
  return {
    id: newId('mix'),
    name: 'New mix',
    root: 'D',
    scale: 'pentatonic',
    tempo: 60,
    seed: Math.floor(Math.random() * 1e9),
    layers: [],
    master: { reverbDecay: 4, reverbWet: 0.25, volume: 0 },
    ...over,
  };
}

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const name = (v: unknown, d: string) => str(v, d).slice(0, MAX_NAME_LENGTH);

/**
 * One parameter against its meta: ranges clamp, selects must name an option,
 * toggles must be booleans, files must be strings. Returns undefined when the
 * value is unusable (the caller keeps its default) — never a value Tone would
 * reject.
 */
function coerceParam(
  meta: ParamMeta | undefined,
  v: unknown,
): number | string | boolean | undefined {
  if (!meta) {
    // Not something the Mixer renders (e.g. drone.voices, music.fileName): type-check only.
    return typeof v === 'number' && Number.isFinite(v)
      ? v
      : typeof v === 'string' || typeof v === 'boolean'
        ? v
        : undefined;
  }
  switch (meta.kind) {
    case 'range':
      return typeof v === 'number' && Number.isFinite(v)
        ? Math.min(meta.max, Math.max(meta.min, v))
        : undefined;
    case 'select':
      return typeof v === 'string' && meta.options.some((o) => o.value === v) ? v : undefined;
    case 'toggle':
      return typeof v === 'boolean' ? v : undefined;
    case 'file':
      return typeof v === 'string' ? v : undefined;
  }
}

function validateEffect(raw: unknown): Effect | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const type = e.type;
  if (!EFFECT_TYPES.includes(type as EffectType)) return null;
  const meta = EFFECT_META[type as EffectType].params;
  const params: Record<string, number | string> = {};
  const rawParams = e.params;
  if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
    for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
      const c = coerceParam(meta[k], v);
      if (typeof c === 'number' || typeof c === 'string') params[k] = c;
    }
  }
  return { type: type as EffectType, enabled: e.enabled !== false, params };
}

function validateLayer(raw: unknown): Layer | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Record<string, unknown>;
  if (!LAYER_TYPES.includes(l.type as LayerType)) return null;
  const type = l.type as LayerType;
  const meta = PARAM_META[type];
  const params: Record<string, number | string | boolean> = { ...LAYER_DEFAULTS[type] };
  const rawParams = l.params;
  if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
    for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
      if (!(k in params)) continue;
      const c = coerceParam(meta[k], v);
      if (c !== undefined) params[k] = c;
    }
  }
  return {
    id: str(l.id, newId(type)),
    type,
    name: name(l.name, LAYER_LABELS[type]),
    gain: num(l.gain, -12, -60, 6),
    pan: num(l.pan, 0, -1, 1),
    muted: l.muted === true,
    params,
    effects: Array.isArray(l.effects)
      ? (l.effects.map(validateEffect).filter(Boolean) as Effect[]).slice(0, MAX_EFFECTS_PER_LAYER)
      : [],
  };
}

/** Accepts anything; returns a well-formed Mix or null when it isn't one. */
export function validateMix(raw: unknown): Mix | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!Array.isArray(m.layers)) return null;
  const layers = (m.layers.map(validateLayer).filter(Boolean) as Layer[]).slice(0, MAX_LAYERS);
  const master = (m.master as Record<string, unknown>) ?? {};
  return {
    id: str(m.id, newId('mix')),
    name: name(m.name, 'Untitled mix'),
    root: isValidRoot(m.root) ? m.root : 'D',
    scale: isValidScale(m.scale) ? m.scale : 'pentatonic',
    tempo: num(m.tempo, 60, 20, 200),
    seed: num(m.seed, 1),
    layers,
    master: {
      reverbDecay: num(master.reverbDecay, 4, 0.1, 20),
      reverbWet: num(master.reverbWet, 0.25, 0, 1),
      volume: num(master.volume, 0, -60, 6),
    },
  };
}
