import { describe, it, expect } from 'vitest';
import {
  CUE_MAX_SECONDS,
  cueLength,
  noteHz,
  parseCuePatch,
  scheduleCue,
  type CueContext,
} from './cue-synth';
import { CUE_PRESETS } from './cue-presets';
import { resolveCue, parseCueChoice, getCues, DEFAULT_CUES } from '@/services/cues';

/**
 * A fake BaseAudioContext that records what the engine asks for: nodes made,
 * connections, oscillator frequencies, gain automation, start/stop times.
 * Enough to prove a preset schedules what its patch says and never leaves a
 * sound running, without a real audio device.
 */
function fakeContext() {
  const log: string[] = [];
  const param = (name: string) => {
    const p = {
      value: 0,
      setValueAtTime: (v: number, t: number) => (log.push(`${name}.set ${v} @${t.toFixed(3)}`), p),
      linearRampToValueAtTime: (v: number, t: number) => (
        log.push(`${name}.lin ${v} @${t.toFixed(3)}`),
        p
      ),
      exponentialRampToValueAtTime: (v: number, t: number) => (
        log.push(`${name}.exp ${v} @${t.toFixed(3)}`),
        p
      ),
    };
    return p;
  };
  const node = (kind: string, extra: Record<string, unknown> = {}) => {
    const n = {
      kind,
      connect: (to: { kind?: string }) => (log.push(`${kind} -> ${to.kind ?? 'destination'}`), to),
      start: (t: number) => log.push(`${kind}.start @${t.toFixed(3)}`),
      stop: (t: number) => log.push(`${kind}.stop @${t.toFixed(3)}`),
      ...extra,
    };
    return n;
  };
  const stops: number[] = [];
  const ctx = {
    currentTime: 1,
    sampleRate: 48000,
    destination: { kind: 'destination' },
    createOscillator: () =>
      node('osc', {
        type: 'sine',
        frequency: param('freq'),
        detune: param('detune'),
        stop: (t: number) => (stops.push(t), log.push(`osc.stop @${t.toFixed(3)}`)),
      }),
    createGain: () => node('gain', { gain: param('gain') }),
    createBiquadFilter: () =>
      node('filter', { type: 'lowpass', frequency: param('f'), Q: param('q') }),
    createDelay: () => node('delay', { delayTime: param('delay') }),
    createWaveShaper: () => node('shaper', { curve: null }),
    createBuffer: (_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () =>
      node('noise', {
        buffer: null,
        loop: false,
        stop: (t: number) => (stops.push(t), log.push(`noise.stop @${t.toFixed(3)}`)),
      }),
  } as unknown as CueContext;
  return { ctx, log, stops };
}

describe('cue synth', () => {
  it('names notes in equal temperament', () => {
    expect(noteHz('A4')).toBe(440);
    expect(noteHz('A5')).toBeCloseTo(880, 6);
    expect(noteHz('C4')).toBeCloseTo(261.63, 1);
    expect(noteHz('Bb3')).toBeCloseTo(233.08, 1);
    expect(() => noteHz('H2')).toThrow(/note/);
  });

  it('every preset parses, stays short, and is a preset the cue service can resolve', () => {
    for (const p of CUE_PRESETS) {
      const patch = parseCuePatch(p.patch);
      expect(cueLength(patch), p.id).toBeLessThanOrEqual(CUE_MAX_SECONDS + 1);
      expect(patch.gain).toBeLessThanOrEqual(1);
      expect(resolveCue(p.id)?.name).toBe(p.patch.name);
    }
    expect(new Set(CUE_PRESETS.map((p) => p.id)).size).toBe(CUE_PRESETS.length);
    // The five the app always had are still here under their old ids.
    for (const id of ['coin', 'tick', 'chime', 'bloom', 'thud'])
      expect(resolveCue(id)).not.toBeNull();
  });

  it('schedules exactly what the patch says and stops every source', () => {
    const { ctx, log, stops } = fakeContext();
    const coin = CUE_PRESETS.find((p) => p.id === 'coin')!.patch;
    const end = scheduleCue(ctx, coin, 1);
    // two square notes: E5 at 0, B5 at 0.075
    expect(log.filter((l) => l === 'osc.start @1.000')).toHaveLength(1);
    expect(log.filter((l) => l === 'osc.start @1.075')).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('osc.stop')).length).toBe(2);
    expect(stops.every((t) => t <= end + 0.06)).toBe(true);
    // the envelope opens from silence and closes toward it
    expect(log.some((l) => l.startsWith('gain.set 0 @1.000'))).toBe(true);
    expect(log.some((l) => l.startsWith('gain.exp 0.0001'))).toBe(true);
    // level applies to the master gain, never above 1
    const { ctx: loud, log: loudLog } = fakeContext();
    scheduleCue(loud, { ...coin, gain: 1 }, 0, 5);
    expect(loudLog.length).toBeGreaterThan(0);
  });

  it('routes a filter, a delay and a bitcrusher when the patch asks', () => {
    const { ctx, log } = fakeContext();
    const dew = CUE_PRESETS.find((p) => p.id === 'dew')!.patch;
    scheduleCue(ctx, dew, 0);
    expect(log.some((l) => l.startsWith('filter ->'))).toBe(true);
    expect(log.some((l) => l.startsWith('delay ->'))).toBe(true);
    const { ctx: c2, log: log2 } = fakeContext();
    scheduleCue(c2, CUE_PRESETS.find((p) => p.id === 'hop')!.patch, 0);
    expect(log2.some((l) => l.startsWith('shaper ->'))).toBe(true);
    const { ctx: c3, log: log3 } = fakeContext();
    scheduleCue(c3, CUE_PRESETS.find((p) => p.id === 'leaf')!.patch, 0);
    expect(log3.some((l) => l.startsWith('noise.start'))).toBe(true);
  });

  it('refuses a patch that could scream or run on', () => {
    const base = CUE_PRESETS[0]!.patch;
    expect(() => parseCuePatch({ ...base, gain: 4 })).toThrow(/gain/);
    expect(() => parseCuePatch({ ...base, voices: [] })).toThrow(/voices/);
    expect(() =>
      parseCuePatch({
        ...base,
        voices: [{ ...base.voices[0], notes: ['E5'], at: [2.9], dur: 2, release: 2 }],
      }),
    ).toThrow(/longer/);
    expect(() =>
      parseCuePatch({ ...base, voices: [{ ...base.voices[0], notes: ['X9'], at: [0] }] }),
    ).toThrow(/note/);
    expect(() => parseCuePatch({ ...base, fx: { bitcrush: 1 } })).toThrow(/bit depth/);
  });

  it('a choice is a preset id or a patch; anything else is silent', () => {
    expect(parseCueChoice('chime')).toBe('chime');
    expect(parseCueChoice('no-such-preset')).toBeNull();
    const own = { ...CUE_PRESETS[1]!.patch, name: 'Mine' };
    expect((parseCueChoice(own) as { name: string }).name).toBe('Mine');
    expect(parseCueChoice({ version: 1 })).toBeNull();
    expect(getCues()).toEqual(DEFAULT_CUES);
  });
});
