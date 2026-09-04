import { describe, it, expect } from 'vitest';
import {
  approach,
  audioLevel,
  clamp01,
  isWritingKey,
  SignalState,
  typingLevel,
  TYPING_DECAY_MS,
} from './signals';

describe('reactive signals — pure parts', () => {
  it('clamps to 0..1 and treats NaN as silence', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(7)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
  });

  it('typing decays from 1 to 0 over the window, easing out, and never goes negative', () => {
    expect(typingLevel(0)).toBe(1);
    expect(typingLevel(-50)).toBe(1);
    const mid = typingLevel(TYPING_DECAY_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(0.5); // ease-out: below the linear midpoint
    expect(typingLevel(TYPING_DECAY_MS)).toBe(0);
    expect(typingLevel(TYPING_DECAY_MS * 10)).toBe(0);
    // monotone
    let prev = 1;
    for (let t = 0; t <= TYPING_DECAY_MS; t += 100) {
      const v = typingLevel(t);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });

  it('audio level follows the Mood Bar curve and is 0 when paused', () => {
    expect(audioLevel(0.25, true)).toBeCloseTo(0.8);
    expect(audioLevel(1, true)).toBe(1);
    expect(audioLevel(0.25, false)).toBe(0);
    expect(audioLevel(-0.1, true)).toBe(0);
    expect(audioLevel(NaN, true)).toBe(0);
  });

  it('approach converges and snaps onto the target', () => {
    let v = 0;
    for (let i = 0; i < 60; i++) v = approach(v, 1);
    expect(v).toBe(1);
    expect(approach(1, 0)).toBeLessThan(1);
    expect(approach(0.5, 0.5)).toBe(0.5);
  });

  it('counts characters, Enter and Backspace; ignores chords and arrows', () => {
    const k = (
      key: string,
      mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean }> = {},
    ) => isWritingKey({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods });
    expect(k('a')).toBe(true);
    expect(k(' ')).toBe(true);
    expect(k('Enter')).toBe(true);
    expect(k('Backspace')).toBe(true);
    expect(k('ArrowLeft')).toBe(false);
    expect(k('Shift')).toBe(false);
    expect(k('s', { metaKey: true })).toBe(false);
    expect(k('k', { ctrlKey: true })).toBe(false);
  });

  it('SignalState: a keystroke spikes typing and it settles back to 0', () => {
    const s = new SignalState();
    expect(s.settled).toBe(true);
    s.keystroke(1000);
    expect(s.tick(1000)).toEqual({ typing: 1 });
    expect(s.settled).toBe(false);
    s.tick(1000 + TYPING_DECAY_MS / 3);
    expect(s.values.typing).toBeGreaterThan(0);
    expect(s.tick(1000 + TYPING_DECAY_MS)).toEqual({ typing: 0 });
    expect(s.settled).toBe(true);
    // Nothing changed → no writes
    expect(s.tick(5000)).toEqual({});
  });

  it('SignalState: agent and audio approach their targets and report only what changed', () => {
    const s = new SignalState();
    s.setAgent(true);
    const first = s.tick(0);
    expect(first.agent).toBeGreaterThan(0);
    expect(first.typing).toBeUndefined();
    for (let t = 16; t < 2000; t += 16) s.tick(t);
    expect(s.values.agent).toBe(1);
    s.setAgent(false);
    s.setAudio(0.25, true);
    for (let t = 2000; t < 4000; t += 16) s.tick(t);
    expect(s.values.agent).toBe(0);
    expect(s.values.audio).toBeCloseTo(0.8);
    expect(s.settled).toBe(true);
    s.setAudio(0.25, false);
    expect(s.settled).toBe(false);
  });
});
