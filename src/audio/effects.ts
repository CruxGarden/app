import * as Tone from 'tone';
import type { Effect } from './schema';

export interface EffectNode {
  /** where the layer feeds in; `output` is what connects onward (same node for single-node effects) */
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
  update(e: Effect): void;
  dispose(): void;
}

const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);

/** Build one effect. Disabled effects are built as pass-through gains so a toggle is cheap. */
export function buildEffect(e: Effect): EffectNode {
  if (!e.enabled) {
    const g = new Tone.Gain(1);
    return { input: g, output: g, update: () => {}, dispose: () => g.dispose() };
  }
  switch (e.type) {
    case 'filter': {
      const f = new Tone.Filter({
        frequency: n(e.params.frequency, 1200),
        Q: n(e.params.q, 1),
        type: s(e.params.kind, 'lowpass') as BiquadFilterType,
      });
      return {
        input: f,
        output: f,
        update: (x) => {
          f.frequency.rampTo(n(x.params.frequency, 1200), 0.2);
          f.Q.rampTo(n(x.params.q, 1), 0.2);
          f.type = s(x.params.kind, 'lowpass') as BiquadFilterType;
        },
        dispose: () => f.dispose(),
      };
    }
    case 'delay': {
      const d = new Tone.FeedbackDelay({
        delayTime: n(e.params.time, 0.35),
        feedback: n(e.params.feedback, 0.35),
        wet: n(e.params.wet, 0.3),
      });
      return {
        input: d,
        output: d,
        update: (x) => {
          d.delayTime.rampTo(n(x.params.time, 0.35), 0.2);
          d.feedback.rampTo(n(x.params.feedback, 0.35), 0.2);
          d.wet.rampTo(n(x.params.wet, 0.3), 0.2);
        },
        dispose: () => d.dispose(),
      };
    }
    case 'reverb': {
      const r = new Tone.Reverb({ decay: n(e.params.decay, 3), wet: n(e.params.wet, 0.3) });
      return {
        input: r,
        output: r,
        update: (x) => {
          r.decay = n(x.params.decay, 3);
          r.wet.rampTo(n(x.params.wet, 0.3), 0.2);
        },
        dispose: () => r.dispose(),
      };
    }
    case 'chorus': {
      const c = new Tone.Chorus({
        frequency: n(e.params.rate, 0.6),
        depth: n(e.params.depth, 0.5),
        wet: n(e.params.wet, 0.4),
      }).start();
      return {
        input: c,
        output: c,
        update: (x) => {
          c.frequency.rampTo(n(x.params.rate, 0.6), 0.2);
          c.depth = n(x.params.depth, 0.5);
          c.wet.rampTo(n(x.params.wet, 0.4), 0.2);
        },
        dispose: () => c.dispose(),
      };
    }
    case 'tape': {
      // wow/flutter + gentle saturation + a soft top end
      const vib = new Tone.Vibrato({ frequency: 0.6, depth: n(e.params.wobble, 0.3) * 0.15 });
      const sat = new Tone.Distortion({ distortion: n(e.params.warmth, 0.4) * 0.25, wet: 0.6 });
      const lp = new Tone.Filter({
        type: 'lowpass',
        frequency: 9000 - n(e.params.warmth, 0.4) * 4500,
        Q: 0.5,
      });
      vib.chain(sat, lp);
      return {
        input: vib,
        output: lp,
        update: (x) => {
          vib.depth.rampTo(n(x.params.wobble, 0.3) * 0.15, 0.2);
          sat.distortion = n(x.params.warmth, 0.4) * 0.25;
          lp.frequency.rampTo(9000 - n(x.params.warmth, 0.4) * 4500, 0.2);
        },
        dispose: () => [vib, sat, lp].forEach((x) => x.dispose()),
      };
    }
    case 'bitcrusher': {
      const b = new Tone.BitCrusher({ bits: Math.round(n(e.params.bits, 8)) });
      b.wet.value = n(e.params.wet, 0.3);
      return {
        input: b,
        output: b,
        update: (x) => {
          b.bits.value = Math.round(n(x.params.bits, 8));
          b.wet.rampTo(n(x.params.wet, 0.3), 0.2);
        },
        dispose: () => b.dispose(),
      };
    }
    case 'compressor': {
      const c = new Tone.Compressor({
        threshold: n(e.params.threshold, -18),
        ratio: n(e.params.ratio, 3),
        attack: 0.01,
        release: 0.2,
      });
      return {
        input: c,
        output: c,
        update: (x) => {
          c.threshold.rampTo(n(x.params.threshold, -18), 0.2);
          c.ratio.rampTo(n(x.params.ratio, 3), 0.2);
        },
        dispose: () => c.dispose(),
      };
    }
    case 'tremolo': {
      const t = new Tone.Tremolo({
        frequency: n(e.params.rate, 2),
        depth: n(e.params.depth, 0.5),
      }).start();
      return {
        input: t,
        output: t,
        update: (x) => {
          t.frequency.rampTo(n(x.params.rate, 2), 0.2);
          t.depth.rampTo(n(x.params.depth, 0.5), 0.2);
        },
        dispose: () => t.dispose(),
      };
    }
  }
}
