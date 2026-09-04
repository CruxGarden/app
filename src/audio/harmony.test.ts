import { describe, it, expect } from 'vitest';
import { chordAt, bassAt, walkAt, PROGRESSIONS } from './harmony';

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
});
