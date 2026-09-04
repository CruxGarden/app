import * as Tone from 'tone';
import type { Effect, EffectType } from './schema';
import { EFFECT_META } from './params-meta';

export interface EffectNode {
  /** where the layer feeds in; `output` is what connects onward (same node for single-node effects) */
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
  update(e: Effect): void;
  dispose(): void;
}

const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);

/**
 * Numeric param clamped to the Mixer's range for that effect (params-meta.ts).
 * validateMix already clamps persisted Mixes; this is the last line before a
 * Tone Param that would throw RangeError on an out-of-range value.
 */
function clamp(type: EffectType, params: Effect['params'], key: string, d: number): number {
  const v = params[key];
  const x = typeof v === 'number' && Number.isFinite(v) ? v : d;
  const meta = EFFECT_META[type].params[key];
  return meta?.kind === 'range' ? Math.min(meta.max, Math.max(meta.min, x)) : x;
}

function passThrough(): EffectNode {
  const g = new Tone.Gain(1);
  return { input: g, output: g, update: () => {}, dispose: () => g.dispose() };
}

/**
 * Build one effect. Disabled effects are built as pass-through gains so a
 * toggle is cheap; an effect whose construction throws (a Tone Param outside
 * its range) becomes a pass-through too, so one bad effect cannot take the
 * whole Mix down.
 */
export function buildEffect(e: Effect): EffectNode {
  if (!e.enabled) return passThrough();
  try {
    return construct(e);
  } catch (err) {
    console.warn(`[resonance] effect "${e.type}" could not be built; bypassing`, err);
    return passThrough();
  }
}

function construct(e: Effect): EffectNode {
  const P = (params: Effect['params'], key: string, d: number) => clamp(e.type, params, key, d);
  switch (e.type) {
    case 'filter': {
      const f = new Tone.Filter({
        frequency: P(e.params, 'frequency', 1200),
        Q: P(e.params, 'q', 1),
        type: s(e.params.kind, 'lowpass') as BiquadFilterType,
      });
      return {
        input: f,
        output: f,
        update: (x) => {
          f.frequency.rampTo(P(x.params, 'frequency', 1200), 0.2);
          f.Q.rampTo(P(x.params, 'q', 1), 0.2);
          f.type = s(x.params.kind, 'lowpass') as BiquadFilterType;
        },
        dispose: () => f.dispose(),
      };
    }
    case 'delay': {
      const d = new Tone.FeedbackDelay({
        delayTime: P(e.params, 'time', 0.35),
        feedback: P(e.params, 'feedback', 0.35),
        wet: P(e.params, 'wet', 0.3),
      });
      return {
        input: d,
        output: d,
        update: (x) => {
          d.delayTime.rampTo(P(x.params, 'time', 0.35), 0.2);
          d.feedback.rampTo(P(x.params, 'feedback', 0.35), 0.2);
          d.wet.rampTo(P(x.params, 'wet', 0.3), 0.2);
        },
        dispose: () => d.dispose(),
      };
    }
    case 'reverb': {
      const r = new Tone.Reverb({ decay: P(e.params, 'decay', 3), wet: P(e.params, 'wet', 0.3) });
      return {
        input: r,
        output: r,
        update: (x) => {
          r.decay = P(x.params, 'decay', 3);
          r.wet.rampTo(P(x.params, 'wet', 0.3), 0.2);
        },
        dispose: () => r.dispose(),
      };
    }
    case 'chorus': {
      const c = new Tone.Chorus({
        frequency: P(e.params, 'rate', 0.6),
        depth: P(e.params, 'depth', 0.5),
        wet: P(e.params, 'wet', 0.4),
      }).start();
      return {
        input: c,
        output: c,
        update: (x) => {
          c.frequency.rampTo(P(x.params, 'rate', 0.6), 0.2);
          c.depth = P(x.params, 'depth', 0.5);
          c.wet.rampTo(P(x.params, 'wet', 0.4), 0.2);
        },
        dispose: () => c.dispose(),
      };
    }
    case 'tape': {
      // wow/flutter + gentle saturation + a soft top end
      const vib = new Tone.Vibrato({ frequency: 0.6, depth: P(e.params, 'wobble', 0.3) * 0.15 });
      const sat = new Tone.Distortion({ distortion: P(e.params, 'warmth', 0.4) * 0.25, wet: 0.6 });
      const lp = new Tone.Filter({
        type: 'lowpass',
        frequency: 9000 - P(e.params, 'warmth', 0.4) * 4500,
        Q: 0.5,
      });
      vib.chain(sat, lp);
      return {
        input: vib,
        output: lp,
        update: (x) => {
          vib.depth.rampTo(P(x.params, 'wobble', 0.3) * 0.15, 0.2);
          sat.distortion = P(x.params, 'warmth', 0.4) * 0.25;
          lp.frequency.rampTo(9000 - P(x.params, 'warmth', 0.4) * 4500, 0.2);
        },
        dispose: () => [vib, sat, lp].forEach((x) => x.dispose()),
      };
    }
    case 'bitcrusher': {
      const b = new Tone.BitCrusher({ bits: Math.round(P(e.params, 'bits', 8)) });
      b.wet.value = P(e.params, 'wet', 0.3);
      return {
        input: b,
        output: b,
        update: (x) => {
          b.bits.value = Math.round(P(x.params, 'bits', 8));
          b.wet.rampTo(P(x.params, 'wet', 0.3), 0.2);
        },
        dispose: () => b.dispose(),
      };
    }
    case 'compressor': {
      const c = new Tone.Compressor({
        threshold: P(e.params, 'threshold', -18),
        ratio: P(e.params, 'ratio', 3),
        attack: 0.01,
        release: 0.2,
      });
      return {
        input: c,
        output: c,
        update: (x) => {
          c.threshold.rampTo(P(x.params, 'threshold', -18), 0.2);
          c.ratio.rampTo(P(x.params, 'ratio', 3), 0.2);
        },
        dispose: () => c.dispose(),
      };
    }
    case 'tremolo': {
      const t = new Tone.Tremolo({
        frequency: P(e.params, 'rate', 2),
        depth: P(e.params, 'depth', 0.5),
      }).start();
      return {
        input: t,
        output: t,
        update: (x) => {
          t.frequency.rampTo(P(x.params, 'rate', 2), 0.2);
          t.depth.rampTo(P(x.params, 'depth', 0.5), 0.2);
        },
        dispose: () => t.dispose(),
      };
    }
  }
}
