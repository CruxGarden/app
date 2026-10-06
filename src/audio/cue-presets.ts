/**
 * The preset bank (SYNTH-CUES-PLAN §2). The first five are the cues the app
 * has always had, as patches with the same notes and envelopes they had as
 * code, so nothing sounds different until someone edits. The rest are grouped
 * by register so a Mood can pick a voice that belongs to its place.
 */
import type { CuePatch } from './cue-synth';

export type CueGroup = 'classic' | 'garden' | '8-bit' | 'office' | 'plasma' | 'bare';

export interface CuePreset {
  id: string;
  name: string;
  group: CueGroup;
  patch: CuePatch;
}

export const CUE_GROUPS: { id: CueGroup; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'garden', label: 'Garden' },
  { id: '8-bit', label: '8-bit' },
  { id: 'office', label: 'Office' },
  { id: 'plasma', label: 'Plasma' },
  { id: 'bare', label: 'Bare' },
];

const PEAK = 0.18;
const v = (
  wave: CuePatch['voices'][number]['wave'],
  notes: string[],
  at: number[],
  dur: number,
  release: number,
  level = 1,
  extra: Partial<CuePatch['voices'][number]> = {},
): CuePatch['voices'][number] => ({
  wave,
  notes,
  at,
  dur,
  attack: 0.005,
  release,
  level,
  ...extra,
});
const patch = (
  name: string,
  voices: CuePatch['voices'],
  rest: Partial<CuePatch> = {},
): CuePatch => ({
  version: 1,
  name,
  voices,
  gain: PEAK,
  ...rest,
});

export const CUE_PRESETS: CuePreset[] = [
  // ── the five the app shipped with, byte-for-byte in spirit ──
  {
    id: 'coin',
    name: '8-bit coin',
    group: 'classic',
    patch: patch('8-bit coin', [
      v('square', ['E5'], [0], 0.04, 0.025, 0.35),
      v('square', ['B5'], [0.075], 0.06, 0.06, 0.35),
    ]),
  },
  {
    id: 'tick',
    name: 'Tick',
    group: 'classic',
    patch: patch('Tick', [v('triangle', ['A6'], [0], 0.03, 0.12, 0.8)]),
  },
  {
    id: 'chime',
    name: 'Chime',
    group: 'classic',
    patch: patch('Chime', [
      v('triangle', ['E5'], [0], 0.1, 0.35),
      v('triangle', ['B5'], [0.12], 0.2, 0.4),
    ]),
  },
  {
    id: 'bloom',
    name: 'Bloom',
    group: 'classic',
    patch: patch('Bloom', [
      v('triangle', ['D4'], [0], 0.5, 1.2),
      v('triangle', ['A4'], [0.15], 0.5, 1.2),
      v('triangle', ['D5'], [0.3], 0.9, 1.2),
    ]),
  },
  {
    id: 'thud',
    name: 'Thud',
    group: 'classic',
    patch: patch('Thud', [v('sine', ['D2'], [0], 0.2, 0.4, 1)], { gain: PEAK * 1.4 }),
  },
  // ── garden: soft, wet, low ──
  {
    id: 'dew',
    name: 'Dew',
    group: 'garden',
    patch: patch('Dew', [v('sine', ['G5', 'D6'], [0, 0.09], 0.06, 0.5, 0.7, { attack: 0.01 })], {
      filter: { type: 'lowpass', hz: 3200, q: 0.7 },
      fx: { delay: { time: 0.18, feedback: 0.25, mix: 0.4 }, reverb: { seconds: 1.2, mix: 0.3 } },
    }),
  },
  {
    id: 'leaf',
    name: 'Leaf',
    group: 'garden',
    patch: patch('Leaf', [v('noise', ['C4'], [0], 0.08, 0.25, 0.35)], {
      filter: { type: 'bandpass', hz: 1800, q: 2.5 },
    }),
  },
  {
    id: 'root',
    name: 'Root',
    group: 'garden',
    patch: patch('Root', [v('sine', ['D3', 'A3'], [0, 0.2], 0.3, 0.9, 0.8, { attack: 0.03 })], {
      filter: { type: 'lowpass', hz: 900, q: 0.8 },
      fx: { reverb: { seconds: 2, mix: 0.4 } },
    }),
  },
  // ── 8-bit: square waves, crushed ──
  {
    id: 'hop',
    name: 'Hop',
    group: '8-bit',
    patch: patch('Hop', [v('square', ['C5', 'G5'], [0, 0.05], 0.04, 0.05, 0.3)], {
      fx: { bitcrush: 6 },
    }),
  },
  {
    id: 'power-up',
    name: 'Power-up',
    group: '8-bit',
    patch: patch(
      'Power-up',
      [v('square', ['C5', 'E5', 'G5', 'C6'], [0, 0.06, 0.12, 0.18], 0.05, 0.12, 0.3)],
      { fx: { bitcrush: 5 } },
    ),
  },
  {
    id: 'hurt',
    name: 'Hurt',
    group: '8-bit',
    patch: patch('Hurt', [v('sawtooth', ['A3', 'E3'], [0, 0.07], 0.06, 0.1, 0.3)], {
      fx: { bitcrush: 4 },
    }),
  },
  // ── office: dry, short, polite ──
  {
    id: 'ping',
    name: 'Ping',
    group: 'office',
    patch: patch('Ping', [v('sine', ['C6'], [0], 0.05, 0.3, 0.9)]),
  },
  {
    id: 'paper',
    name: 'Paper',
    group: 'office',
    patch: patch('Paper', [v('noise', ['C4'], [0], 0.04, 0.12, 0.4)], {
      filter: { type: 'highpass', hz: 2500, q: 0.7 },
    }),
  },
  {
    id: 'two-tone',
    name: 'Two-tone',
    group: 'office',
    patch: patch('Two-tone', [v('sine', ['E5', 'C5'], [0, 0.14], 0.1, 0.2, 0.8)]),
  },
  // ── plasma: wet clicks and ripples ──
  {
    id: 'drop',
    name: 'Drop',
    group: 'plasma',
    patch: patch('Drop', [v('sine', ['A5', 'A4'], [0, 0.02], 0.03, 0.3, 0.8)], {
      filter: { type: 'lowpass', hz: 2400, q: 6 },
    }),
  },
  {
    id: 'ripple',
    name: 'Ripple',
    group: 'plasma',
    patch: patch(
      'Ripple',
      [v('triangle', ['E4', 'B4', 'E5'], [0, 0.11, 0.22], 0.08, 0.6, 0.6, { attack: 0.02 })],
      {
        fx: {
          delay: { time: 0.22, feedback: 0.35, mix: 0.5 },
          reverb: { seconds: 1.6, mix: 0.35 },
        },
      },
    ),
  },
  {
    id: 'membrane',
    name: 'Membrane',
    group: 'plasma',
    patch: patch('Membrane', [v('sine', ['F2'], [0], 0.15, 0.5, 1, { detune: -30 })], {
      gain: PEAK * 1.3,
      filter: { type: 'lowpass', hz: 400, q: 1.2 },
    }),
  },
  // ── bare: one sine, nearly nothing ──
  {
    id: 'blip',
    name: 'Blip',
    group: 'bare',
    patch: patch('Blip', [v('sine', ['A5'], [0], 0.02, 0.06, 0.6)]),
  },
  {
    id: 'low',
    name: 'Low',
    group: 'bare',
    patch: patch('Low', [v('sine', ['A2'], [0], 0.08, 0.2, 0.7)]),
  },
];

const byId = new Map(CUE_PRESETS.map((p) => [p.id, p]));

export function cuePreset(id: string): CuePreset | null {
  return byId.get(id) ?? null;
}
