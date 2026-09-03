/**
 * Layer runtimes — one builder per LayerType. Each returns nodes wired to an
 * `output` and knows how to update itself from new params without a rebuild
 * where possible. All Tone objects are created here and disposed here.
 */
import * as Tone from 'tone';
import { SCALES, type Layer, type Mix } from './schema';
import { makeRng } from './rng';

export interface LayerRuntime {
  output: Tone.ToneAudioNode;
  start(): void;
  stop(): void;
  update(layer: Layer, mix: Mix): void;
  dispose(): void;
}

const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const s = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

function scaleNotes(mix: Mix, octave: number, count = 8): string[] {
  const steps = SCALES[mix.scale] ?? SCALES.pentatonic!;
  const root = Tone.Frequency(`${mix.root}${octave}`);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const deg = steps[i % steps.length]! + 12 * Math.floor(i / steps.length);
    out.push(root.transpose(deg).toNote());
  }
  return out;
}

// ── Rain ──────────────────────────────────────────────────────────────────
function rain(layer: Layer, _mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const bed = new Tone.Noise('pink');
  const bedFilter = new Tone.Filter({ type: 'bandpass', frequency: 1200, Q: 0.7 });
  const bedGain = new Tone.Gain(0.5);
  const sway = new Tone.LFO({ frequency: 0.07, min: 0.35, max: 0.65 }).start();
  bed.chain(bedFilter, bedGain, out);
  sway.connect(bedGain.gain);
  // Drops: short bright ticks from white noise
  const drops = new Tone.Noise('white');
  const dropFilter = new Tone.Filter({ type: 'highpass', frequency: 4500 });
  const env = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: 0.03, sustain: 0, release: 0.02 });
  const dropGain = new Tone.Gain(0.35);
  drops.chain(dropFilter, env, dropGain, out);
  let dropChance = 0.4;
  const loop = new Tone.Loop((time) => {
    if (Math.random() < dropChance) env.triggerAttackRelease(0.01, time);
  }, '32n');
  const apply = (l: Layer) => {
    const intensity = n(l.params.intensity, 0.5);
    const brightness = n(l.params.brightness, 0.5);
    dropChance = n(l.params.drops, 0.4) * 0.6;
    bedFilter.frequency.rampTo(lerp(500, 3200, brightness), 0.5);
    sway.min = lerp(0.1, 0.5, intensity);
    sway.max = lerp(0.3, 1.0, intensity);
    dropGain.gain.rampTo(lerp(0.1, 0.5, intensity), 0.5);
  };
  apply(layer);
  return {
    output: out,
    start: () => {
      bed.start();
      drops.start();
      loop.start(0);
    },
    stop: () => {
      bed.stop();
      drops.stop();
      loop.stop();
    },
    update: (l) => apply(l),
    dispose: () =>
      [loop, sway, bed, bedFilter, bedGain, drops, dropFilter, env, dropGain, out].forEach((x) =>
        x.dispose(),
      ),
  };
}

// ── Wind ──────────────────────────────────────────────────────────────────
function wind(layer: Layer): LayerRuntime {
  const out = new Tone.Gain(1);
  const src = new Tone.Noise('brown');
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 400, Q: 1.2 });
  const gain = new Tone.Gain(0.6);
  const gust = new Tone.LFO({ frequency: 0.08, min: 200, max: 900 }).start();
  src.chain(filter, gain, out);
  gust.connect(filter.frequency);
  const apply = (l: Layer) => {
    const strength = n(l.params.strength, 0.5);
    const g = n(l.params.gust, 0.4);
    const height = n(l.params.height, 0.5);
    gust.frequency.rampTo(lerp(0.03, 0.25, g), 1);
    gust.min = lerp(120, 400, height);
    gust.max = lerp(400, 1600, height) * lerp(0.6, 1.2, g);
    gain.gain.rampTo(lerp(0.15, 1, strength), 0.5);
  };
  apply(layer);
  return {
    output: out,
    start: () => src.start(),
    stop: () => src.stop(),
    update: apply,
    dispose: () => [gust, src, filter, gain, out].forEach((x) => x.dispose()),
  };
}

// ── Noise ─────────────────────────────────────────────────────────────────
function noise(layer: Layer): LayerRuntime {
  const out = new Tone.Gain(1);
  let src = new Tone.Noise(s(layer.params.color, 'brown') as Tone.NoiseType);
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 2000, Q: 0.5 });
  const drift = new Tone.LFO({ frequency: 0.03, min: 1500, max: 2500 }).start();
  src.chain(filter, out);
  drift.connect(filter.frequency);
  let color = s(layer.params.color, 'brown');
  let running = false;
  const apply = (l: Layer) => {
    const cutoff = n(l.params.cutoff, 0.5);
    const d = n(l.params.drift, 0.3);
    const center = lerp(200, 8000, cutoff);
    drift.min = center * lerp(1, 0.5, d);
    drift.max = center * lerp(1, 1.6, d);
    const c = s(l.params.color, 'brown');
    if (c !== color) {
      color = c;
      src.stop();
      src.disconnect();
      src.dispose();
      src = new Tone.Noise(c as Tone.NoiseType);
      src.connect(filter);
      if (running) src.start();
    }
  };
  apply(layer);
  return {
    output: out,
    start: () => {
      running = true;
      src.start();
    },
    stop: () => {
      running = false;
      src.stop();
    },
    update: apply,
    dispose: () => [drift, src, filter, out].forEach((x) => x.dispose()),
  };
}

// ── Drone ─────────────────────────────────────────────────────────────────
function drone(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 600, Q: 1 });
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: {
      type: s(layer.params.waveform, 'fatsawtooth') as never,
      count: 3,
      spread: 18,
    } as never,
    envelope: { attack: 4, decay: 1, sustain: 1, release: 6 },
    volume: -8,
  });
  const move = new Tone.LFO({ frequency: 0.05, min: 400, max: 900 }).start();
  synth.chain(filter, out);
  move.connect(filter.frequency);
  let notes: string[] = [];
  const chordFor = (l: Layer, m: Mix) => {
    const octave = Math.round(n(l.params.octave, 2));
    const root = Tone.Frequency(`${m.root}${octave}`);
    const chord = s(l.params.chord, 'root5');
    const iv =
      chord === 'root'
        ? [0]
        : chord === 'root5oct'
          ? [0, 7, 12]
          : chord === 'minor7'
            ? [0, 3, 7, 10]
            : [0, 7];
    return iv.map((i) => root.transpose(i).toNote());
  };
  const apply = (l: Layer, m: Mix) => {
    const cutoff = n(l.params.cutoff, 0.35);
    const movement = n(l.params.movement, 0.3);
    const center = lerp(150, 2400, cutoff);
    move.min = center * lerp(1, 0.5, movement);
    move.max = center * lerp(1, 1.8, movement);
    move.frequency.rampTo(lerp(0.02, 0.2, movement), 1);
    synth.set({ oscillator: { type: s(l.params.waveform, 'fatsawtooth') as never } as never });
    const next = chordFor(l, m);
    if (next.join() !== notes.join() && notes.length) {
      synth.triggerRelease(notes);
      notes = next;
      synth.triggerAttack(notes);
    } else notes = next;
  };
  apply(layer, mix);
  return {
    output: out,
    start: () => synth.triggerAttack(notes),
    stop: () => synth.releaseAll(),
    update: apply,
    dispose: () => [move, synth, filter, out].forEach((x) => x.dispose()),
  };
}

// ── Pad ───────────────────────────────────────────────────────────────────
function pad(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: s(layer.params.waveform, 'triangle') as never } as never,
    envelope: {
      attack: n(layer.params.attack, 3),
      decay: 2,
      sustain: 0.8,
      release: n(layer.params.release, 6),
    },
    volume: -10,
  });
  const shimmer = new Tone.Chorus({ frequency: 0.3, depth: 0.5, wet: 0.3 }).start();
  synth.chain(shimmer, out);
  const rng = makeRng(mix.seed + 7);
  let cfg = {
    every: n(layer.params.changeEvery, 8),
    octave: Math.round(n(layer.params.octave, 3)),
  };
  let bar = 0;
  const loop = new Tone.Loop((time) => {
    bar += 1;
    if (bar % Math.max(1, Math.round(cfg.every)) !== 1 && cfg.every > 1) return;
    const notes = scaleNotes(mix, cfg.octave, 9);
    const degrees = [0, 3, 4, 5]; // I IV V vi in scale index terms
    const d = degrees[Math.floor(rng() * degrees.length)]!;
    const chord = [notes[d]!, notes[(d + 2) % notes.length]!, notes[(d + 4) % notes.length]!];
    synth.triggerAttackRelease(chord, `${Math.max(1, cfg.every - 1)}n`.replace('n', 'm'), time);
  }, '1m');
  const apply = (l: Layer) => {
    cfg = { every: n(l.params.changeEvery, 8), octave: Math.round(n(l.params.octave, 3)) };
    synth.set({
      envelope: { attack: n(l.params.attack, 3), release: n(l.params.release, 6) } as never,
      oscillator: { type: s(l.params.waveform, 'triangle') as never } as never,
    });
    shimmer.wet.rampTo(n(l.params.shimmer, 0.3), 0.5);
  };
  apply(layer);
  return {
    output: out,
    start: () => {
      bar = 0;
      loop.start(0);
    },
    stop: () => {
      loop.stop();
      synth.releaseAll();
    },
    update: apply,
    dispose: () => [loop, shimmer, synth, out].forEach((x) => x.dispose()),
  };
}

// ── Melody ────────────────────────────────────────────────────────────────
function melody(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const synth = new Tone.Synth({
    oscillator: { type: s(layer.params.instrument, 'sine') as never } as never,
    envelope: { attack: 0.02, decay: 0.4, sustain: 0.2, release: 1.4 },
    volume: -6,
  });
  const echo = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.35, wet: 0.4 });
  synth.chain(echo, out);
  const rng = makeRng(mix.seed);
  let cfg = {
    density: n(layer.params.density, 0.25),
    octave: Math.round(n(layer.params.octave, 5)),
    humanize: n(layer.params.humanize, 0.3),
  };
  let last = 0;
  const loop = new Tone.Loop((time) => {
    if (rng() > cfg.density) return;
    const notes = scaleNotes(mix, cfg.octave, 10);
    // mostly small steps, occasionally a leap
    const step = rng() < 0.75 ? Math.round((rng() - 0.5) * 3) : Math.round((rng() - 0.5) * 8);
    last = Math.min(notes.length - 1, Math.max(0, last + step));
    const jitter = (rng() - 0.5) * 0.06 * cfg.humanize;
    synth.triggerAttackRelease(notes[last]!, rng() < 0.3 ? '4n' : '8n', time + Math.max(0, jitter));
  }, '8n');
  const apply = (l: Layer) => {
    cfg = {
      density: n(l.params.density, 0.25),
      octave: Math.round(n(l.params.octave, 5)),
      humanize: n(l.params.humanize, 0.3),
    };
    echo.wet.rampTo(n(l.params.echo, 0.4), 0.5);
    synth.set({ oscillator: { type: s(l.params.instrument, 'sine') as never } as never });
  };
  apply(layer);
  return {
    output: out,
    start: () => loop.start(0),
    stop: () => loop.stop(),
    update: apply,
    dispose: () => [loop, echo, synth, out].forEach((x) => x.dispose()),
  };
}

// ── Music / Sample (a file from the Blob Store) ────────────────────────────
function player(layer: Layer): LayerRuntime {
  const out = new Tone.Gain(1);
  const p = new Tone.Player({
    loop: layer.params.loop !== false,
    fadeIn: n(layer.params.fadeIn, 1),
    fadeOut: n(layer.params.fadeOut, 1),
    playbackRate: n(layer.params.rate, 1),
  });
  p.connect(out);
  let fingerprint = '';
  let wantPlaying = false;
  let url: string | null = null;
  const load = async (fp: string) => {
    fingerprint = fp;
    if (url) URL.revokeObjectURL(url);
    url = null;
    if (!fp) return;
    try {
      const { blobObjectUrl } = await import('@/services/blobs');
      const u = await blobObjectUrl(fp);
      if (fp !== fingerprint) return; // superseded
      url = u;
      await p.load(u);
      if (wantPlaying && p.loaded) p.start();
    } catch (err) {
      console.warn('[resonance] could not load audio', fp, err);
    }
  };
  const apply = (l: Layer) => {
    p.loop = l.params.loop !== false;
    p.playbackRate = n(l.params.rate, 1);
    p.fadeIn = n(l.params.fadeIn, 1);
    p.fadeOut = n(l.params.fadeOut, 1);
    const fp = s(l.params.fingerprint, '');
    if (fp !== fingerprint) void load(fp);
  };
  apply(layer);
  return {
    output: out,
    start: () => {
      wantPlaying = true;
      if (p.loaded) p.start();
    },
    stop: () => {
      wantPlaying = false;
      if (p.state === 'started') p.stop();
    },
    update: apply,
    dispose: () => {
      p.dispose();
      out.dispose();
      if (url) URL.revokeObjectURL(url);
    },
  };
}

export function buildLayer(layer: Layer, mix: Mix): LayerRuntime {
  switch (layer.type) {
    case 'rain':
      return rain(layer, mix);
    case 'wind':
      return wind(layer);
    case 'noise':
      return noise(layer);
    case 'drone':
      return drone(layer, mix);
    case 'pad':
      return pad(layer, mix);
    case 'melody':
      return melody(layer, mix);
    case 'music':
    case 'sample':
      return player(layer);
  }
}
