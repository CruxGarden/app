import { describe, it, expect } from 'vitest';
import { SynthScore, synthRandom, type SynthNote } from './synth-score';
import { synthPreset } from './synth-patch';

describe('ambient musical transport', () => {
  it('renders the same phrases offline and with live lookahead scheduling', () => {
    const patch = synthPreset('prism');
    const offline: (SynthNote & { track: number })[] = [],
      live: (SynthNote & { track: number })[] = [];
    // Scores share pitches/timing; humanized strength uses a PRNG whose event order differs.
    new SynthScore(synthRandom(1)).take(patch, 0, 64, (_, track, n) =>
      offline.push({ ...n, strength: 1, track }),
    );
    const score = new SynthScore(synthRandom(1));
    for (let t = 0; t < 64; t += 0.1)
      score.take(patch, t, Math.min(64, t + 0.25), (_, track, n) =>
        live.push({ ...n, strength: 1, track }),
      );
    const ordered = (notes: typeof live) =>
      notes.sort((a, b) => a.time - b.time || a.track - b.track);
    expect(ordered(live)).toEqual(ordered(offline));
    expect(
      new Set(offline.filter((n) => n.track === 1).map((n) => n.notes[0])).size,
    ).toBeGreaterThan(2);
  });
  it('does not flood old notes after a suspended window resumes', () => {
    const patch = synthPreset('prism'),
      score = new SynthScore();
    const resumed: SynthNote[] = [];
    score.take(patch, 0, 0.25, () => {});
    score.take(patch, 300, 300.25, (_t, _i, n) => resumed.push(n));
    expect(resumed.length).toBeLessThanOrEqual(4);
    expect(resumed.every((n) => n.time >= 300)).toBe(true);
  });
});
