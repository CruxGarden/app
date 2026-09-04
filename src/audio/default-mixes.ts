import { createLayer, createMix, type Mix } from './schema';

/**
 * The Default Mood's soundscape until composed tracks exist — curated Mixes
 * built from the procedural layers. Ids are stable so settings can reference
 * them; users can edit copies.
 */
export const DEFAULT_MIXES: Mix[] = [
  createMix({
    id: 'dusk-in-the-garden',
    name: 'Dusk in the Garden',
    root: 'D',
    scale: 'pentatonic',
    tempo: 54,
    seed: 4,
    layers: [
      createLayer('rain', {
        id: 'dusk-rain',
        gain: -20,
        params: { intensity: 0.35, brightness: 0.4, drops: 0.35 },
      }),
      createLayer('drone', {
        id: 'dusk-drone',
        gain: -18,
        params: { cutoff: 0.3, movement: 0.25, octave: 2 },
      }),
      createLayer('pad', {
        id: 'dusk-pad',
        gain: -20,
        params: { attack: 4, release: 8, shimmer: 0.35, changeEvery: 12 },
      }),
      createLayer('melody', {
        id: 'dusk-melody',
        gain: -22,
        params: { density: 0.18, octave: 5, echo: 0.5 },
      }),
    ],
    master: { reverbDecay: 6, reverbWet: 0.3, volume: 0 },
  }),
  createMix({
    id: 'night-rain',
    name: 'Night Rain',
    root: 'A',
    scale: 'minorPentatonic',
    tempo: 48,
    seed: 11,
    layers: [
      createLayer('rain', {
        id: 'night-rain',
        gain: -14,
        params: { intensity: 0.7, brightness: 0.3, drops: 0.6 },
      }),
      createLayer('wind', {
        id: 'night-wind',
        gain: -26,
        params: { strength: 0.3, gust: 0.5, height: 0.3 },
      }),
      createLayer('drone', {
        id: 'night-drone',
        gain: -22,
        params: { cutoff: 0.2, movement: 0.15, octave: 1, waveform: 'sine' },
      }),
    ],
    master: { reverbDecay: 8, reverbWet: 0.35, volume: 0 },
  }),
  createMix({
    id: 'still-air',
    name: 'Still Air',
    root: 'F',
    scale: 'lydian',
    tempo: 40,
    seed: 23,
    layers: [
      createLayer('drone', {
        id: 'still-drone',
        gain: -18,
        params: { cutoff: 0.4, movement: 0.4, octave: 2, waveform: 'fatsine' },
      }),
      createLayer('pad', {
        id: 'still-pad',
        gain: -16,
        params: { attack: 6, release: 10, shimmer: 0.5, changeEvery: 16 },
      }),
    ],
    master: { reverbDecay: 10, reverbWet: 0.45, volume: 0 },
  }),
  createMix({
    id: 'brown-noise',
    name: 'Brown Noise',
    root: 'C',
    scale: 'major',
    tempo: 60,
    seed: 1,
    layers: [
      createLayer('noise', {
        id: 'brown',
        gain: -14,
        params: { color: 'brown', drift: 0.2, cutoff: 0.4 },
      }),
    ],
    master: { reverbDecay: 1, reverbWet: 0, volume: 0 },
  }),
  createMix({
    id: 'lofi-study',
    name: 'Lofi Study',
    root: 'F',
    scale: 'major',
    tempo: 72,
    seed: 19,
    layers: [
      createLayer('keys', {
        id: 'lofi-keys',
        gain: -14,
        params: {
          instrument: 'rhodes',
          progression: 'lofi',
          voicing: 'seventh',
          rhythm: 'half',
          octave: 4,
          humanize: 0.5,
          wobble: 0.35,
          tone: 0.5,
        },
        effects: [{ type: 'tape', enabled: true, params: { wobble: 0.35, warmth: 0.5 } }],
      }),
      createLayer('beat', {
        id: 'lofi-beat',
        gain: -16,
        params: {
          pattern: 'lofi',
          density: 0.7,
          swing: 0.6,
          tone: 0.45,
          hats: 0.55,
          humanize: 0.5,
        },
        effects: [{ type: 'bitcrusher', enabled: true, params: { bits: 8, wet: 0.25 } }],
      }),
      createLayer('bass', {
        id: 'lofi-bass',
        gain: -16,
        params: { pattern: 'root', progression: 'lofi', octave: 2, tone: 0.35, glide: 0.25 },
      }),
      createLayer('vinyl', {
        id: 'lofi-vinyl',
        gain: -22,
        params: { crackle: 0.5, dust: 0.4, hum: 0.1 },
      }),
      createLayer('rain', {
        id: 'lofi-rain',
        gain: -30,
        params: { intensity: 0.25, brightness: 0.3, drops: 0.2 },
      }),
    ],
    master: { reverbDecay: 2.5, reverbWet: 0.18, volume: 0 },
  }),
];
