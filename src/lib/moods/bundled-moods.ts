/**
 * Bundled Moods — complete looks-and-sounds that ship with the app: a theme
 * preset (plus a few extra tokens), a background, a composed soundscape,
 * cues and a persona voice. They are ordinary Mood Packages, so Apply, Export
 * and Publish work exactly as for a Mood someone made; they carry no binary
 * assets (textures and backgrounds are CSS; sound is synthesized).
 *
 * The point is range: not eight palettes on one layout, but eight different
 * rooms — shapes, type, density, motion and sound all move together.
 */
import { MOOD_PRESETS } from './presets';
import type { MoodPackage } from './packages';
import { createLayer, createMix, type Mix, type Layer, type LayerType } from '@/audio/schema';
import { BgType } from '@/lib/types';
import { DEFAULT_CUES, type SoundCues } from '@/services/cues';
import type { PersonaSettings } from '@/services/persona';

const CREATED = '2026-09-04T00:00:00.000Z';

function preset(id: string) {
  const p = MOOD_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`bundled mood: no preset ${id}`);
  return p;
}

type L = Partial<Layer> & { type: LayerType };
function layer(
  type: LayerType,
  id: string,
  gain: number,
  params: Record<string, number | string | boolean> = {},
  effects: Layer['effects'] = [],
): L {
  return { type, id, gain, params, effects };
}
function mix(over: Omit<Partial<Mix>, 'layers'> & { id: string; name: string; layers: L[] }): Mix {
  const { layers, ...rest } = over;
  return createMix({
    ...rest,
    layers: layers.map((l) => createLayer(l.type, l)),
  });
}

interface Spec {
  id: string;
  name: string;
  presetId: string;
  extra?: Record<string, string>;
  background: { type: BgType };
  mixes: Mix[];
  cues?: Partial<SoundCues>;
  volume?: number;
  persona: Pick<PersonaSettings, 'name' | 'greeting' | 'systemPrompt'>;
}

const SPECS: Spec[] = [
  {
    id: 'rainy-day-cafe',
    name: 'Rainy Day Café',
    presetId: 'rainy-day-cafe',
    background: { type: BgType.Drift },
    mixes: [
      mix({
        id: 'rdc-window-seat',
        name: 'Window Seat',
        root: 'Eb',
        scale: 'major',
        tempo: 58,
        seed: 412,
        layers: [
          layer('rain', 'rdc-rain', -16, { intensity: 0.55, brightness: 0.3, drops: 0.45 }),
          layer(
            'keys',
            'rdc-piano',
            -20,
            {
              instrument: 'piano',
              progression: 'wistful',
              voicing: 'seventh',
              rhythm: 'whole',
              octave: 4,
              humanize: 0.7,
              wobble: 0,
              tone: 0.45,
            },
            [{ type: 'reverb', enabled: true, params: { decay: 5, wet: 0.35 } }],
          ),
          layer('noise', 'rdc-murmur', -34, { color: 'brown', cutoff: 0.2, drift: 0.3 }),
          layer('vinyl', 'rdc-dust', -30, { crackle: 0.2, dust: 0.35, hum: 0.05 }),
        ],
        master: { reverbDecay: 4, reverbWet: 0.22, volume: 0 },
      }),
    ],
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'Marguerite',
      greeting: 'Take your time. The rain isn’t going anywhere, and neither am I.',
      systemPrompt:
        'You are Marguerite, a quiet, attentive collaborator — the friend across the table on a rainy afternoon. Soft-spoken, unhurried, precise when it matters. You leave room for silence and never rush the person.',
    },
  },
  {
    id: 'spring-morning',
    name: 'Spring Morning',
    presetId: 'spring-morning',
    background: { type: BgType.Bloom },
    mixes: [
      mix({
        id: 'spring-first-light',
        name: 'First Light',
        root: 'A',
        scale: 'lydian',
        tempo: 66,
        seed: 321,
        layers: [
          layer('melody', 'spring-birds', -24, {
            instrument: 'sine',
            octave: 6,
            density: 0.14,
            humanize: 0.8,
            echo: 0.3,
          }),
          layer(
            'keys',
            'spring-bells',
            -26,
            {
              instrument: 'bells',
              progression: 'static',
              voicing: 'triad',
              rhythm: 'arp',
              octave: 5,
              humanize: 0.6,
              wobble: 0,
              tone: 0.8,
            },
            [{ type: 'reverb', enabled: true, params: { decay: 6, wet: 0.4 } }],
          ),
          layer('pad', 'spring-pad', -26, {
            waveform: 'sine',
            octave: 4,
            attack: 7,
            release: 12,
            shimmer: 0.2,
            changeEvery: 16,
          }),
          layer('wind', 'spring-breeze', -32, { strength: 0.2, gust: 0.2, height: 0.7 }),
        ],
        master: { reverbDecay: 5, reverbWet: 0.3, volume: 0 },
      }),
    ],
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud' },
    volume: 0.45,
    persona: {
      name: 'Wren',
      greeting: 'Morning. Something small to start with?',
      systemPrompt:
        'You are Wren, a light, delicate collaborator. Brief and gentle; you prefer the smallest change that works and you notice details. No hype, no heaviness.',
    },
  },
  {
    id: 'snowed-in',
    name: 'Snowed In',
    presetId: 'snowed-in',
    background: { type: BgType.Drift },
    mixes: [
      mix({
        id: 'snow-hush',
        name: 'Hush',
        root: 'F',
        scale: 'major',
        tempo: 46,
        seed: 1212,
        layers: [
          layer('noise', 'snow-air', -26, { color: 'pink', cutoff: 0.18, drift: 0.2 }, [
            { type: 'filter', enabled: true, params: { kind: 'lowpass', frequency: 900, q: 0.5 } },
          ]),
          layer(
            'pad',
            'snow-pad',
            -22,
            {
              waveform: 'triangle',
              octave: 3,
              attack: 8,
              release: 14,
              shimmer: 0.25,
              changeEvery: 16,
            },
            [
              {
                type: 'filter',
                enabled: true,
                params: { kind: 'lowpass', frequency: 1800, q: 0.4 },
              },
            ],
          ),
          layer('keys', 'snow-keys', -26, {
            instrument: 'rhodes',
            progression: 'gospel',
            voicing: 'seventh',
            rhythm: 'whole',
            octave: 4,
            humanize: 0.7,
            wobble: 0.1,
            tone: 0.3,
          }),
          layer('wind', 'snow-wind', -34, { strength: 0.25, gust: 0.15, height: 0.4 }),
        ],
        master: { reverbDecay: 8, reverbWet: 0.35, volume: 0 },
      }),
    ],
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.45,
    persona: {
      name: 'Ilse',
      greeting: 'Nowhere to be today. What shall we make of it?',
      systemPrompt:
        'You are Ilse, a calm, cosy collaborator for a snowed-in day. Warm, plain-spoken, patient. You keep things tidy and simple and enjoy slow, careful work.',
    },
  },
  {
    id: 'blade-runner-rain',
    name: 'Blade Runner Rain',
    presetId: 'blade-runner',
    extra: {
      paneCollaborationBorder: 'linear-gradient(135deg, #16d5e8, #ff6a1a)',
      paneWorkshopBorder: 'linear-gradient(135deg, #ff6a1a, #ff3b8c)',
      flowColor: '#ff3b8c',
      flowBg: '#04050d',
      flowSpeed: '0.5',
      fontScale: '0.94',
      motionScale: '1.3',
      grainOpacity: '0.12',
      paneHeaderLabelTracking: '0.2em',
      moodBar: '#06070f',
      moodBarBorder: '#16d5e8',
      moodBarAccent: '#ff6a1a',
      moodBarAccentText: '#04050d',
      moodBarRadius: '2px',
    },
    background: { type: BgType.Flow },
    mixes: [
      mix({
        id: 'br-neon-rain',
        name: 'Neon Rain',
        root: 'D',
        scale: 'minor',
        tempo: 56,
        seed: 2019,
        layers: [
          layer('rain', 'br-rain', -14, { intensity: 0.75, brightness: 0.35, drops: 0.7 }),
          layer(
            'drone',
            'br-drone',
            -16,
            { waveform: 'fatsawtooth', chord: 'minor7', octave: 1, cutoff: 0.3, movement: 0.5 },
            [{ type: 'chorus', enabled: true, params: { rate: 0.2, depth: 0.6, wet: 0.4 } }],
          ),
          layer(
            'melody',
            'br-lead',
            -20,
            { instrument: 'sine', octave: 5, density: 0.12, humanize: 0.5, echo: 0.7 },
            [{ type: 'delay', enabled: true, params: { time: 0.75, feedback: 0.5, wet: 0.5 } }],
          ),
          layer('vinyl', 'br-hum', -30, { crackle: 0.15, dust: 0.3, hum: 0.35 }),
        ],
        master: { reverbDecay: 9, reverbWet: 0.4, volume: 0 },
      }),
    ],
    cues: { toolDone: 'tick', published: 'bloom', error: 'thud', message: null, snapshot: null },
    volume: 0.6,
    persona: {
      name: 'Deckard',
      greeting:
        'Rain again. Tell me what you want built and I’ll get it done before the neon burns out.',
      systemPrompt:
        'You are Deckard, a laconic, dry, competent collaborator in a rain-soaked neon city. Short sentences. No exclamation marks. You care about craft and detail. When you finish work, describe it plainly.',
    },
  },
  {
    id: 'lofi-study-cafe',
    name: 'Lofi Study Café',
    presetId: 'lofi-cafe',
    background: { type: BgType.Bloom },
    mixes: [
      mix({
        id: 'lofi-cafe-mix',
        name: 'Study Beats',
        root: 'F',
        scale: 'major',
        tempo: 74,
        seed: 7,
        layers: [
          layer(
            'keys',
            'lc-keys',
            -14,
            {
              instrument: 'rhodes',
              progression: 'lofi',
              voicing: 'seventh',
              rhythm: 'half',
              octave: 4,
              humanize: 0.5,
              wobble: 0.35,
              tone: 0.5,
            },
            [{ type: 'tape', enabled: true, params: { wobble: 0.35, warmth: 0.5 } }],
          ),
          layer(
            'beat',
            'lc-beat',
            -16,
            { pattern: 'lofi', density: 0.7, swing: 0.6, tone: 0.45, hats: 0.55, humanize: 0.5 },
            [{ type: 'bitcrusher', enabled: true, params: { bits: 8, wet: 0.25 } }],
          ),
          layer('bass', 'lc-bass', -16, {
            pattern: 'root',
            progression: 'lofi',
            octave: 2,
            tone: 0.35,
            glide: 0.25,
          }),
          layer('vinyl', 'lc-vinyl', -22, { crackle: 0.5, dust: 0.4, hum: 0.1 }),
          layer('rain', 'lc-rain', -30, { intensity: 0.25, brightness: 0.3, drops: 0.2 }),
        ],
        master: { reverbDecay: 2.5, reverbWet: 0.18, volume: 0 },
      }),
      mix({
        id: 'lofi-cafe-late',
        name: 'Late Shift',
        root: 'Bb',
        scale: 'dorian',
        tempo: 68,
        seed: 11,
        layers: [
          layer(
            'keys',
            'll-keys',
            -15,
            {
              instrument: 'guitar',
              progression: 'jazz',
              voicing: 'seventh',
              rhythm: 'stabs',
              octave: 4,
              humanize: 0.6,
              wobble: 0.2,
              tone: 0.45,
            },
            [{ type: 'tape', enabled: true, params: { wobble: 0.25, warmth: 0.6 } }],
          ),
          layer('beat', 'll-beat', -18, {
            pattern: 'half',
            density: 0.6,
            swing: 0.62,
            tone: 0.4,
            hats: 0.4,
            humanize: 0.6,
          }),
          layer('bass', 'll-bass', -17, {
            pattern: 'walk',
            progression: 'jazz',
            octave: 2,
            tone: 0.4,
            glide: 0.35,
          }),
          layer('vinyl', 'll-vinyl', -24, { crackle: 0.6, dust: 0.5, hum: 0.05 }),
        ],
        master: { reverbDecay: 3, reverbWet: 0.22, volume: 0 },
      }),
    ],
    cues: { toolDone: null, published: 'chime', snapshot: null, error: 'thud', message: null },
    volume: 0.55,
    persona: {
      name: 'Juniper',
      greeting: 'Hey. Coffee’s on. What are we making today?',
      systemPrompt:
        'You are Juniper, an easygoing study-buddy collaborator. Warm, encouraging, unhurried. You keep things simple, celebrate small progress, and never lecture.',
    },
  },
  {
    id: 'windows-95',
    name: 'Windows 95',
    presetId: 'windows-95',
    extra: {
      motionScale: '0',
      cardHoverLift: '0px',
      hoverBrightness: '1',
      activeBrightness: '1',
      elevationDropdown: '2px 2px 0 #000000',
      elevationTooltip: '2px 2px 0 #000000',
      focusRing: '#000000',
      focusRingWidth: '1px',
      moodBarRadius: '0px',
      moodBarShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #808080',
    },
    background: { type: BgType.Blank },
    mixes: [
      mix({
        id: 'w95-silence',
        name: 'Office Hum',
        root: 'C',
        scale: 'major',
        tempo: 90,
        seed: 95,
        layers: [
          layer('noise', 'w95-fan', -34, { color: 'brown', cutoff: 0.25, drift: 0.1 }),
          layer('vinyl', 'w95-hum', -40, { crackle: 0, dust: 0, hum: 0.5 }),
        ],
        master: { reverbDecay: 0.5, reverbWet: 0, volume: 0 },
      }),
    ],
    cues: {
      message: 'tick',
      toolDone: 'tick',
      snapshot: 'tick',
      published: 'chime',
      error: 'thud',
    },
    volume: 0.4,
    persona: {
      name: 'Assistant',
      greeting: 'It looks like you’re making something. Would you like help with that?',
      systemPrompt:
        'You are a cheerful, slightly formal office assistant from 1995. You offer help proactively, use plain business English, and keep a can-do tone. You occasionally mention that a task is "just a few clicks away."',
    },
  },
  {
    id: 'solarpunk-garden',
    name: 'Solarpunk Garden',
    presetId: 'solarpunk-garden',
    background: { type: BgType.Bloom },
    mixes: [
      mix({
        id: 'sp-canopy',
        name: 'Canopy',
        root: 'G',
        scale: 'lydian',
        tempo: 50,
        seed: 33,
        layers: [
          layer('wind', 'sp-wind', -20, { strength: 0.45, gust: 0.35, height: 0.85 }),
          layer('pad', 'sp-pad', -18, {
            waveform: 'fattriangle',
            octave: 3,
            attack: 6,
            release: 10,
            shimmer: 0.5,
            changeEvery: 12,
          }),
          layer('melody', 'sp-melody', -22, {
            instrument: 'triangle',
            octave: 5,
            density: 0.2,
            humanize: 0.5,
            echo: 0.5,
          }),
          layer('rain', 'sp-leaves', -34, { intensity: 0.15, brightness: 0.7, drops: 0.5 }),
        ],
        master: { reverbDecay: 7, reverbWet: 0.35, volume: 0 },
      }),
    ],
    cues: { toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud', message: null },
    volume: 0.6,
    persona: {
      name: 'Sol',
      greeting: 'The garden is awake. What shall we grow?',
      systemPrompt:
        'You are Sol, an optimistic, grounded collaborator who thinks in seasons and systems. You like things that last, reuse what exists, and favour clarity over cleverness. Gentle humour, no cynicism.',
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    presetId: 'terminal',
    extra: {
      motionScale: '0',
      cardHoverLift: '0px',
      focusRingWidth: '2px',
      fontScale: '1.08',
      grainOpacity: '0.06',
    },
    background: { type: BgType.Blank },
    mixes: [
      mix({
        id: 'term-brown',
        name: 'Brown Noise',
        root: 'A',
        scale: 'minorPentatonic',
        tempo: 60,
        seed: 1,
        layers: [layer('noise', 'term-noise', -18, { color: 'brown', cutoff: 0.35, drift: 0.2 })],
        master: { reverbDecay: 0.5, reverbWet: 0, volume: 0 },
      }),
      mix({
        id: 'term-boombap',
        name: 'Code Bap',
        root: 'A',
        scale: 'minor',
        tempo: 88,
        seed: 88,
        layers: [
          layer(
            'beat',
            'tb-beat',
            -14,
            { pattern: 'boombap', density: 0.8, swing: 0.56, tone: 0.55, hats: 0.6, humanize: 0.3 },
            [{ type: 'compressor', enabled: true, params: { threshold: -14, ratio: 4 } }],
          ),
          layer('bass', 'tb-bass', -14, {
            pattern: 'pulse',
            progression: 'minor',
            octave: 2,
            tone: 0.45,
            glide: 0.1,
          }),
          layer(
            'keys',
            'tb-keys',
            -20,
            {
              instrument: 'organ',
              progression: 'minor',
              voicing: 'triad',
              rhythm: 'stabs',
              octave: 4,
              humanize: 0.3,
              wobble: 0,
              tone: 0.5,
            },
            [
              {
                type: 'filter',
                enabled: true,
                params: { kind: 'lowpass', frequency: 2400, q: 0.8 },
              },
            ],
          ),
        ],
        master: { reverbDecay: 1.2, reverbWet: 0.1, volume: 0 },
      }),
    ],
    cues: { message: null, toolDone: 'tick', snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'root',
      greeting: '$ ready.',
      systemPrompt:
        'You are root: terse, exact, technical. Prefer code and commands to prose. One line when one line will do. No pleasantries, no emoji.',
    },
  },
  {
    id: 'sunday-paper',
    name: 'Sunday Paper',
    presetId: 'sunday-paper',
    background: { type: BgType.Blank },
    mixes: [
      mix({
        id: 'sp-morning-edition',
        name: 'Morning Edition',
        root: 'C',
        scale: 'major',
        tempo: 62,
        seed: 1901,
        layers: [
          layer('keys', 'me-piano', -14, {
            instrument: 'piano',
            progression: 'pop',
            voicing: 'triad',
            rhythm: 'whole',
            octave: 4,
            humanize: 0.5,
            wobble: 0,
            tone: 0.7,
          }),
          layer('beat', 'me-brush', -26, {
            pattern: 'brush',
            density: 0.5,
            swing: 0.5,
            tone: 0.5,
            hats: 0.5,
            humanize: 0.6,
          }),
          layer('bass', 'me-bass', -20, {
            pattern: 'root',
            progression: 'pop',
            octave: 2,
            tone: 0.3,
            glide: 0.2,
          }),
        ],
        master: { reverbDecay: 8, reverbWet: 0.42, volume: 0 },
      }),
    ],
    cues: { message: null, toolDone: null, snapshot: null, published: 'chime', error: 'thud' },
    volume: 0.5,
    persona: {
      name: 'The Editor',
      greeting: 'Good morning. What’s the story?',
      systemPrompt:
        'You are The Editor: literate, precise, a little wry. You care about structure and clean prose, you cut what does not earn its place, and you explain edits briefly. Serif sensibility.',
    },
  },
  {
    id: 'deep-sea',
    name: 'Deep Sea',
    presetId: 'deep-sea',
    extra: {
      driftColor: '#7fe3d8',
      driftGlow: '#1e6bff',
      driftBg: '#020914',
      driftSpeed: '0.35',
      driftDensity: '160',
      elevationDropdown: '0 30px 60px -20px rgb(0 0 0 / 0.8)',
      elevationPanel: '0 30px 80px -30px rgb(0 0 0 / 0.8)',
      motionScale: '1.8',
      glassBlur: '20px',
    },
    background: { type: BgType.Drift },
    mixes: [
      mix({
        id: 'ds-abyss',
        name: 'Abyss',
        root: 'E',
        scale: 'lydian',
        tempo: 40,
        seed: 2000,
        layers: [
          layer('drone', 'ds-drone', -14, {
            waveform: 'fatsine',
            chord: 'root5oct',
            octave: 1,
            cutoff: 0.2,
            movement: 0.35,
          }),
          layer('pad', 'ds-pad', -20, {
            waveform: 'sine',
            octave: 3,
            attack: 8,
            release: 14,
            shimmer: 0.3,
            changeEvery: 16,
          }),
          layer('wind', 'ds-current', -24, { strength: 0.35, gust: 0.25, height: 0.9 }),
          layer('noise', 'ds-pressure', -30, { color: 'brown', cutoff: 0.15, drift: 0.4 }),
        ],
        master: { reverbDecay: 14, reverbWet: 0.5, volume: 0 },
      }),
    ],
    cues: { message: null, toolDone: null, snapshot: 'bloom', published: 'bloom', error: 'thud' },
    volume: 0.55,
    persona: {
      name: 'Nautilus',
      greeting: 'Down here, everything moves slowly and nothing is lost. What are we diving for?',
      systemPrompt:
        'You are Nautilus, a calm, deep-voiced collaborator. Patient and thorough. You take your time to get things right and you say so. Metaphors of depth and pressure, used sparingly.',
    },
  },
  {
    id: 'pretty-in-pink',
    name: 'Pretty in Pink',
    presetId: 'pretty-in-pink',
    extra: {
      motionScale: '1.2',
      cardHoverLift: '3px',
      chipRadius: '9999px',
      buttonRadius: '9999px',
      bloomSpeed: '0.8',
    },
    background: { type: BgType.Bloom },
    mixes: [
      mix({
        id: 'pip-prom',
        name: 'Prom Night',
        root: 'E',
        scale: 'major',
        tempo: 96,
        seed: 1986,
        layers: [
          layer(
            'keys',
            'pip-bells',
            -16,
            {
              instrument: 'bells',
              progression: 'axis',
              voicing: 'triad',
              rhythm: 'arp',
              octave: 5,
              humanize: 0.2,
              wobble: 0.1,
              tone: 0.7,
            },
            [{ type: 'chorus', enabled: true, params: { rate: 0.8, depth: 0.6, wet: 0.5 } }],
          ),
          layer('beat', 'pip-beat', -16, {
            pattern: 'half',
            density: 0.75,
            swing: 0.5,
            tone: 0.7,
            hats: 0.7,
            humanize: 0.2,
          }),
          layer('bass', 'pip-bass', -15, {
            pattern: 'pulse',
            progression: 'axis',
            octave: 2,
            tone: 0.55,
            glide: 0.05,
          }),
          layer('pad', 'pip-pad', -20, {
            waveform: 'fatsawtooth',
            octave: 3,
            attack: 1.5,
            release: 4,
            shimmer: 0.6,
            changeEvery: 4,
          }),
        ],
        master: { reverbDecay: 3.5, reverbWet: 0.3, volume: 0 },
      }),
    ],
    cues: {
      message: 'chime',
      toolDone: 'tick',
      snapshot: 'bloom',
      published: 'bloom',
      error: 'thud',
    },
    volume: 0.6,
    persona: {
      name: 'Andie',
      greeting: 'Okay. So. What are we making, and can it be fabulous?',
      systemPrompt:
        'You are Andie, an upbeat, funny, big-hearted 1980s collaborator. Enthusiastic without being saccharine, quick with a compliment, allergic to boring. You still do careful work.',
    },
  },
];

function build(spec: Spec): MoodPackage {
  const p = preset(spec.presetId);
  const active = spec.mixes[0]!;
  return {
    format: 'crux-mood',
    version: 1,
    id: spec.id,
    name: spec.name,
    author: 'Crux Garden',
    created: CREATED,
    theme: {
      format: 'crux-mood-theme',
      version: 1,
      name: spec.name,
      section: p.section,
      author: 'Crux Garden',
      created: CREATED,
      overrides: { ...p.overrides, ...(spec.extra ?? {}) },
    },
    background: { type: spec.background.type },
    persona: {
      name: spec.persona.name,
      greeting: spec.persona.greeting,
      systemPrompt: spec.persona.systemPrompt,
    },
    assets: [],
    resonance: {
      mixes: spec.mixes,
      playlist: {
        enabled: spec.mixes.length > 1,
        shuffle: false,
        items: spec.mixes.map((m) => ({ mixId: m.id, minutes: 25, crossfadeSec: 8 })),
      },
      cues: { ...DEFAULT_CUES, ...(spec.cues ?? {}) },
      activeMixId: active.id,
      volume: spec.volume ?? 0.6,
    },
  };
}

export const BUNDLED_MOODS: MoodPackage[] = SPECS.map(build);

export function bundledMood(id: string): MoodPackage | undefined {
  return BUNDLED_MOODS.find((m) => m.id === id);
}
