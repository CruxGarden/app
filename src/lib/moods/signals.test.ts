import { describe, it, expect } from 'vitest';
import {
  approach,
  audioLevel,
  clamp01,
  isWritingKey,
  SignalState,
  typingLevel,
  TYPING_DECAY_MS,
  decayActivity,
  ACTIVITY_HALF_LIFE_MS,
  ACTIVITY_PER_EVENT,
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
    // A keystroke moves typing and activity; typing is the one that spikes.
    expect(s.tick(1000).typing).toBe(1);
    expect(s.settled).toBe(false);
    s.tick(1000 + TYPING_DECAY_MS / 3);
    expect(s.values.typing).toBeGreaterThan(0);
    expect(s.tick(1000 + TYPING_DECAY_MS).typing).toBe(0);
    // Activity outlives it by minutes, so settle the long way round.
    s.tick(1000 + ACTIVITY_HALF_LIFE_MS * 8);
    expect(s.settled).toBe(true);
    // Nothing changed → no writes
    expect(s.tick(1000 + ACTIVITY_HALF_LIFE_MS * 9)).toEqual({});
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

  it('decayActivity: halves over the half life, quantised, and reaches zero', () => {
    expect(decayActivity(0, 0)).toBe(0);
    expect(decayActivity(1, 0)).toBe(1);
    expect(decayActivity(1, ACTIVITY_HALF_LIFE_MS)).toBeCloseTo(0.5, 2);
    expect(decayActivity(1, ACTIVITY_HALF_LIFE_MS * 2)).toBeCloseTo(0.25, 2);
    // quantised to 1/64 steps so a minutes-long fade does not repaint per frame
    expect(decayActivity(1, 1000) * 64).toBe(Math.round(decayActivity(1, 1000) * 64));
    // and it ends, rather than trailing an invisible fraction for ever
    expect(decayActivity(1, ACTIVITY_HALF_LIFE_MS * 8)).toBe(0);
  });

  it('SignalState: events stack activity, which then falls away on its own', () => {
    const s = new SignalState();
    s.tick(0);
    expect(s.values.activity).toBe(0);
    expect(s.settled).toBe(true);

    s.happened(0);
    s.tick(0);
    expect(s.values.activity).toBeCloseTo(ACTIVITY_PER_EVENT, 1);
    expect(s.settled).toBe(false);

    // a second event at the same moment stacks on the first
    s.happened(0);
    s.tick(0);
    expect(s.values.activity).toBeGreaterThan(ACTIVITY_PER_EVENT);

    // a busy stretch saturates rather than overshooting
    for (let t = 0; t < 40; t++) s.happened(t * 100);
    s.tick(4000);
    expect(s.values.activity).toBe(1);

    // and a quiet stretch brings it back to rest
    s.tick(4000 + ACTIVITY_HALF_LIFE_MS * 8);
    expect(s.values.activity).toBe(0);
    expect(s.settled).toBe(true);
  });

  it('SignalState: a keystroke counts as activity, not only as typing', () => {
    const s = new SignalState();
    s.keystroke(0);
    s.tick(0);
    expect(s.values.typing).toBe(1);
    expect(s.values.activity).toBeGreaterThan(0);
    // typing is gone long before activity is
    s.tick(TYPING_DECAY_MS + 1);
    expect(s.values.typing).toBe(0);
    expect(s.values.activity).toBeGreaterThan(0);
  });
});
