import { describe, it, expect } from 'vitest';
import { chordAt, bassAt, walkAt, gridAt, PROGRESSIONS } from './harmony';

describe('harmony', () => {
  it('voices ii–V–I in C major as Dm, G, C, C', () => {
    const bars = [0, 1, 2, 3].map((bar) =>
      chordAt({ root: 'C', scale: 'major', progression: 'lofi', bar, octave: 4 }),
    );
    expect(bars[0]).toEqual(['D4', 'F4', 'A4']);
    expect(bars[1]).toEqual(['G4', 'B4', 'D5']);
    expect(bars[2]).toEqual(['C4', 'E4', 'G4']);
    expect(bars[3]).toEqual(bars[2]);
  });
  it('sevenths add the seventh; bass is the chord root; loops past the progression length', () => {
    expect(
      chordAt({
        root: 'C',
        scale: 'major',
        progression: 'lofi',
        bar: 1,
        octave: 4,
        voicing: 'seventh',
      }),
    ).toEqual(['G4', 'B4', 'D5', 'F5']);
    expect(bassAt({ root: 'C', scale: 'major', progression: 'lofi', bar: 5, octave: 2 })).toBe(
      'G2',
    );
    expect(walkAt({ root: 'C', scale: 'major', progression: 'lofi', bar: 2, octave: 2 }, 4)).toBe(
      'G2',
    );
  });
  it('handles flats and non-C roots and unknown names gracefully', () => {
    expect(
      chordAt({ root: 'Bb', scale: 'minor', progression: 'minor', bar: 0, octave: 3 })[0],
    ).toBe('A#3');
    expect(
      chordAt({ root: 'D', scale: 'nope', progression: 'nope', bar: 0, octave: 3 }),
    ).toHaveLength(3);
    expect(Object.keys(PROGRESSIONS).length).toBeGreaterThan(5);
  });

  describe('gridAt', () => {
    const PPQ = 192;
    it('maps ticks to bar / beat / sixteenth', () => {
      expect(gridAt(0, PPQ)).toEqual({ bar: 0, beat: 0, step: 0 });
      expect(gridAt(PPQ, PPQ)).toEqual({ bar: 0, beat: 1, step: 4 });
      expect(gridAt(PPQ * 4, PPQ)).toEqual({ bar: 1, beat: 0, step: 0 });
      expect(gridAt(PPQ * 5 + PPQ / 4, PPQ)).toEqual({ bar: 1, beat: 1, step: 5 });
      expect(gridAt(PPQ * 4 * 7 + PPQ * 3, PPQ)).toEqual({ bar: 7, beat: 3, step: 12 });
    });

    it('snaps to the nearest sixteenth so bar, beat and step never disagree', () => {
      // a tick a hair before a bar line (float drift) is that bar, not the last step of the previous one
      expect(gridAt(PPQ * 4 - 0.001, PPQ)).toEqual({ bar: 1, beat: 0, step: 0 });
      expect(gridAt(PPQ * 4 - 1, PPQ)).toEqual({ bar: 1, beat: 0, step: 0 });
      for (let k = 0; k < 64; k++) {
        const g = gridAt((k * PPQ) / 4 + 0.3, PPQ);
        expect(g).toEqual({ bar: Math.floor(k / 16), beat: Math.floor(k / 4) % 4, step: k % 16 });
        expect(g.bar * 16 + g.beat * 4 + (g.step % 4)).toBe(k);
      }
    });

    it('is defensive about garbage', () => {
      expect(gridAt(-50, PPQ)).toEqual({ bar: 0, beat: 0, step: 0 });
      expect(gridAt(NaN, PPQ)).toEqual({ bar: 0, beat: 0, step: 0 });
      expect(gridAt(100, 0)).toEqual({ bar: 0, beat: 0, step: 0 });
    });
  });
});
