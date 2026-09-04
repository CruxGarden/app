/**
 * Harmony shared by the musical layers: chord progressions as scale degrees,
 * voiced inside the mix's scale, so keys, bass (and anything else) agree on
 * what chord bar N is. Pure functions; no Tone.js.
 */
import { SCALES } from './schema';

/** Progressions as 0-based scale-degree indexes; one entry per bar, looping. */
export const PROGRESSIONS: Record<string, number[]> = {
  /** ii – V – I – I: the lofi / jazz staple */
  lofi: [1, 4, 0, 0],
  /** I – vi – IV – V */
  pop: [0, 5, 3, 4],
  /** I – V – vi – IV */
  axis: [0, 4, 5, 3],
  /** i – VII – VI – VII (works in minor scales) */
  minor: [0, 6, 5, 6],
  /** I – IV – V – I */
  gospel: [0, 3, 4, 0],
  /** ii – V – I – vi with a turnaround feel */
  jazz: [1, 4, 0, 5],
  /** stay on the root */
  static: [0],
  /** I – iii – IV – vi: wistful */
  wistful: [0, 2, 3, 5],
};

export const PROGRESSION_NAMES = Object.keys(PROGRESSIONS);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteIndex(root: string): number {
  const norm = root
    .replace('Db', 'C#')
    .replace('Eb', 'D#')
    .replace('Gb', 'F#')
    .replace('Ab', 'G#')
    .replace('Bb', 'A#');
  const i = NOTE_NAMES.indexOf(norm);
  return i < 0 ? 2 : i; // default D
}

/** MIDI-ish semitone for scale degree `deg` (may exceed the scale length → next octave). */
function degreeSemitone(scale: number[], deg: number): number {
  const len = scale.length;
  const oct = Math.floor(deg / len);
  const idx = ((deg % len) + len) % len;
  return scale[idx]! + 12 * oct;
}

function noteName(rootIdx: number, octave: number, semitone: number): string {
  const abs = rootIdx + semitone;
  const name = NOTE_NAMES[((abs % 12) + 12) % 12]!;
  return `${name}${octave + Math.floor(abs / 12)}`;
}

export interface ChordOpts {
  root: string;
  scale: string;
  progression: string;
  bar: number;
  octave: number;
  /** triad (3 notes) or seventh (4) */
  voicing?: 'triad' | 'seventh';
}

/** The chord for bar N as note names, stacked in thirds inside the scale. */
export function chordAt(o: ChordOpts): string[] {
  const scale = SCALES[o.scale] ?? SCALES.major!;
  const prog = PROGRESSIONS[o.progression] ?? PROGRESSIONS.lofi!;
  const deg = prog[((o.bar % prog.length) + prog.length) % prog.length]!;
  const stack = o.voicing === 'seventh' ? [0, 2, 4, 6] : [0, 2, 4];
  const rootIdx = noteIndex(o.root);
  return stack.map((k) => noteName(rootIdx, o.octave, degreeSemitone(scale, deg + k)));
}

/** The chord's root note for bar N (for a bass line). */
export function bassAt(o: Omit<ChordOpts, 'voicing'>): string {
  return chordAt({ ...o, voicing: 'triad' })[0]!;
}

/** A scale degree above the bass for walking lines. */
export function walkAt(o: Omit<ChordOpts, 'voicing'>, step: number): string {
  const scale = SCALES[o.scale] ?? SCALES.major!;
  const prog = PROGRESSIONS[o.progression] ?? PROGRESSIONS.lofi!;
  const deg = prog[((o.bar % prog.length) + prog.length) % prog.length]! + step;
  return noteName(noteIndex(o.root), o.octave, degreeSemitone(scale, deg));
}

/** Where a scheduled time falls on the bar grid (4/4, sixteenth resolution). */
export interface GridPosition {
  /** 0-based bar index since the transport started */
  bar: number;
  /** 0..3 */
  beat: number;
  /** 0..15 */
  step: number;
}

/**
 * Bar / beat / sixteenth for a transport tick count. Snaps to the nearest
 * sixteenth first so bar, beat and step always agree (a tick a hair before a
 * bar line is that bar, not the last step of the previous one). Every
 * musical layer derives its position from the *scheduled* time this way, so
 * they all see the same "one" — reading the transport's live position inside
 * a lookahead callback does not.
 */
export function gridAt(ticks: number, ppq: number): GridPosition {
  if (!(ppq > 0) || !Number.isFinite(ticks)) return { bar: 0, beat: 0, step: 0 };
  const sixteenths = Math.max(0, Math.round(ticks / (ppq / 4)));
  return {
    bar: Math.floor(sixteenths / 16),
    beat: Math.floor(sixteenths / 4) % 4,
    step: sixteenths % 16,
  };
}
