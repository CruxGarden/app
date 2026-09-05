/**
 * Two sounds, off by default: a soft key click for each character the voice
 * types (a 4 ms noise burst through a bandpass, −24 dB) and one low tone when
 * the name resolves. Nothing else — no chime for a right guess, no buzz for a
 * wrong one; silence where other products put praise.
 *
 * WebAudio, built lazily on the first play (after the toggle's click, so the
 * browser allows it). Any failure is swallowed: sound is never load-bearing.
 */

export interface Sound {
  click(): void;
  tone(): void;
  /** Release the audio context. */
  close(): void;
}

const LEVEL = Math.pow(10, -24 / 20); // −24 dB

type Ctx = AudioContext;

export function createSound(factory?: () => Ctx): Sound {
  let ctx: Ctx | null = null;
  let noise: AudioBuffer | null = null;

  const context = (): Ctx | null => {
    if (ctx) return ctx;
    try {
      const make =
        factory ??
        (() => {
          const C = (globalThis as { AudioContext?: new () => Ctx }).AudioContext;
          if (!C) throw new Error('no AudioContext');
          return new C();
        });
      ctx = make();
      // 4 ms of white noise; the bandpass shapes it into a key
      const n = Math.max(1, Math.round(ctx.sampleRate * 0.004));
      noise = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    } catch {
      return null;
    }
  };

  return {
    click() {
      const c = context();
      if (!c || !noise) return;
      try {
        if (c.state === 'suspended') void c.resume();
        const src = c.createBufferSource();
        src.buffer = noise;
        const band = c.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 2600;
        band.Q.value = 1.4;
        const gain = c.createGain();
        gain.gain.value = LEVEL;
        src.connect(band).connect(gain).connect(c.destination);
        src.start();
      } catch {
        /* never load-bearing */
      }
    },
    tone() {
      const c = context();
      if (!c) return;
      try {
        if (c.state === 'suspended') void c.resume();
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 196; // G3 — low, not a fanfare
        const gain = c.createGain();
        const t = c.currentTime;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(LEVEL, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.3);
      } catch {
        /* as above */
      }
    },
    close() {
      try {
        void ctx?.close();
      } catch {
        /* as above */
      }
      ctx = null;
      noise = null;
    },
  };
}
