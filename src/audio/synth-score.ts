import type { SynthPatch, SynthTrack } from './synth-patch';

/** A repeatable score, shared by real-time playback and listening renders. */
export function synthRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export interface SynthNote {
  time: number;
  duration: number;
  notes: number[];
  strength: number;
}
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};
const PROGRESSION = [0, 5, 3, 4, 0, 3, 5, 4];
const MOTIF = [0, 2, 1, 3, 2, 1, 0, 1];
export class SynthScore {
  private next = [0, 0, 1, 0.25];
  private steps = [0, 0, 0, 0];
  private previous: number[][] = [[], [], [], []];
  constructor(private random = Math.random) {}
  /** Skip missed time instead of emitting a burst after a sleeping/hidden window. */
  take(
    patch: SynthPatch,
    seconds: number,
    horizon: number,
    emit: (track: SynthTrack, index: number, note: SynthNote) => void,
  ) {
    const beat = 60 / patch.tempo;
    for (let i = 0; i < 4; i++) {
      if (this.next[i]! < seconds - 0.25) this.next[i] = seconds + i * 0.08;
      while (this.next[i]! <= horizon) {
        const t = patch.tracks[i]!;
        const at = this.next[i]!;
        const phrase = Math.floor(at / (beat * 16));
        const degree = PROGRESSION[phrase % PROGRESSION.length]!;
        const scale = SCALES[patch.mode];
        const pitch = (d: number) => patch.root + scale[d % 7]! + 12 * Math.floor(d / 7);
        const chord = [pitch(degree), pitch(degree + 2), pitch(degree + 4)];
        let notes: number[];
        let duration: number;
        let spacing: number;
        if (t.voice === 'pad') {
          // Invert into the closest register, keeping common tones between phrases.
          notes = chord
            .map((n, k) => {
              const target = this.previous[i]![k] ?? patch.root + [0, 7, 16][k]!;
              return [n - 12, n, n + 12].reduce((a, b) =>
                Math.abs(a - target) < Math.abs(b - target) ? a : b,
              );
            })
            .sort((a, b) => a - b);
          spacing = beat * (t.movement > 0.65 ? 8 : 16);
          duration = spacing + beat * 4;
        } else if (t.voice === 'bass') {
          notes = [pitch(degree) - 12];
          while (notes[0]! > patch.root - 5) notes[0]! -= 12;
          spacing = beat * (t.movement > 0.6 ? 4 : 8);
          duration = spacing * 0.9 + 1;
        } else if (t.voice === 'bell') {
          const step = this.steps[i]!;
          const offset = MOTIF[(step + Math.floor(phrase / 4)) % MOTIF.length]!;
          notes = [pitch(degree + [0, 2, 4, 8][offset]!) + 12];
          while (notes[0]! > 88) notes[0]! -= 12;
          spacing =
            beat * (t.movement < 0.25 ? 4 : t.movement < 0.65 ? 2 : 1) * (step % 8 === 7 ? 2 : 1);
          duration = Math.min(9, beat * 4.5);
        } else {
          notes = [pitch(degree + 4) + 12];
          spacing = beat * (12 - t.movement * 6);
          duration = spacing + 4;
        }
        this.previous[i] = notes;
        this.steps[i]!++;
        this.next[i] = at + spacing;
        if (!t.muted && t.level > 0)
          emit(t, i, { time: at, duration, notes, strength: 0.82 + this.random() * 0.18 });
      }
    }
  }
}
