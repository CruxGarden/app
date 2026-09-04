/**
 * Layer runtimes — one builder per LayerType. Each returns nodes wired to an
 * `output` and knows how to update itself from new params without a rebuild
 * where possible. All Tone objects are created here and disposed here.
 */
import * as Tone from 'tone';
import { SCALES, type Layer, type Mix } from './schema';
import { makeRng } from './rng';
import { chordAt, bassAt, walkAt, gridAt, type GridPosition } from './harmony';

/**
 * Bar / beat / step for the time a Loop callback was *scheduled* for. Loop
 * callbacks fire ~100 ms ahead of `time`, so Transport.position (now) would
 * read the previous beat near every boundary; private counters reset in
 * start() drift from the tick grid Loop.start(0) aligns to. Every musical
 * layer uses this, so they agree on the one and on the chord.
 */
function grid(time: number): GridPosition {
  const T = Tone.getTransport();
  return gridAt(T.getTicksAtTime(time), T.PPQ);
}

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
/** Octave kept where note names stay inside MIDI (C0..C8) — above that an oscillator frequency throws. */
const oct = (v: unknown, d: number) => Math.min(8, Math.max(0, Math.round(n(v, d))));

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
    const octave = oct(l.params.octave, 2);
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
    octave: oct(layer.params.octave, 3),
  };
  const loop = new Tone.Loop((time) => {
    const { bar } = grid(time);
    if (bar % Math.max(1, Math.round(cfg.every)) !== 0) return;
    const notes = scaleNotes(mix, cfg.octave, 9);
    const degrees = [0, 3, 4, 5]; // I IV V vi in scale index terms
    const d = degrees[Math.floor(rng() * degrees.length)]!;
    const chord = [notes[d]!, notes[(d + 2) % notes.length]!, notes[(d + 4) % notes.length]!];
    synth.triggerAttackRelease(chord, `${Math.max(1, cfg.every - 1)}n`.replace('n', 'm'), time);
  }, '1m');
  const apply = (l: Layer) => {
    cfg = { every: n(l.params.changeEvery, 8), octave: oct(l.params.octave, 3) };
    synth.set({
      envelope: { attack: n(l.params.attack, 3), release: n(l.params.release, 6) } as never,
      oscillator: { type: s(l.params.waveform, 'triangle') as never } as never,
    });
    shimmer.wet.rampTo(n(l.params.shimmer, 0.3), 0.5);
  };
  apply(layer);
  return {
    output: out,
    start: () => loop.start(0),
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
    octave: oct(layer.params.octave, 5),
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
      octave: oct(l.params.octave, 5),
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

// ── Beat ──────────────────────────────────────────────────────────────────
// 16-step patterns: k = kick, s = snare, h = hat, H = open hat, '.' = rest
const BEAT_PATTERNS: Record<string, { kick: string; snare: string; hat: string }> = {
  lofi: { kick: 'k.........k.....', snare: '....s.......s...', hat: 'h.h.h.h.h.h.h.H.' },
  boombap: { kick: 'k......k..k.....', snare: '....s.......s...', hat: '..h...h...h...h.' },
  half: { kick: 'k.......k.......', snare: '............s...', hat: '....h.......h...' },
  four: { kick: 'k...k...k...k...', snare: '....s.......s...', hat: '..h...h...h...h.' },
  brush: { kick: '................', snare: '....s.......s...', hat: 'hhhhhhhhhhhhhhhh' },
};

function beat(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const tone = new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 0.4 });
  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.06,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.4 },
    volume: -4,
  });
  const snare = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0, release: 0.08 },
    volume: -10,
  });
  const snareBody = new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 0.8 });
  const hat = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
    volume: -18,
  });
  const hatFilter = new Tone.Filter({ type: 'highpass', frequency: 7000 });
  kick.connect(tone);
  snare.chain(snareBody, tone);
  hat.chain(hatFilter, tone);
  tone.connect(out);
  const rng = makeRng(mix.seed + 21);
  let cfg = {
    pattern: s(layer.params.pattern, 'lofi'),
    density: n(layer.params.density, 0.7),
    swing: n(layer.params.swing, 0.55),
    hats: n(layer.params.hats, 0.6),
    humanize: n(layer.params.humanize, 0.4),
  };
  const seq = new Tone.Loop((time) => {
    const p = BEAT_PATTERNS[cfg.pattern] ?? BEAT_PATTERNS.lofi!;
    const i = grid(time).step;
    // swing: push the off-16ths late. 0.5 is straight; the meta floor is 0.5
    // because a hit cannot be scheduled before its own slot.
    const sixteenth = Tone.Time('16n').toSeconds();
    const late = i % 2 === 1 ? Math.max(0, cfg.swing - 0.5) * sixteenth * 0.9 : 0;
    const jitter = (rng() - 0.5) * 0.02 * cfg.humanize;
    const t = time + Math.max(0, late + jitter);
    const vel = (base: number) =>
      Math.min(1, Math.max(0.2, base * (1 - (rng() - 0.5) * 0.4 * cfg.humanize)));
    if (p.kick[i] === 'k' && (i === 0 || rng() < cfg.density + 0.2))
      kick.triggerAttackRelease('C1', '8n', t, vel(0.9));
    if (p.snare[i] === 's' && rng() < cfg.density + 0.25)
      snare.triggerAttackRelease('8n', t, vel(0.8));
    const h = p.hat[i];
    if ((h === 'h' || h === 'H') && rng() < cfg.hats) {
      hat.envelope.decay = h === 'H' ? 0.18 : 0.05;
      hat.triggerAttackRelease('16n', t, vel(h === 'H' ? 0.6 : 0.45));
    }
  }, '16n');
  const apply = (l: Layer) => {
    cfg = {
      pattern: s(l.params.pattern, 'lofi'),
      density: n(l.params.density, 0.7),
      swing: n(l.params.swing, 0.55),
      hats: n(l.params.hats, 0.6),
      humanize: n(l.params.humanize, 0.4),
    };
    tone.frequency.rampTo(lerp(900, 9000, n(l.params.tone, 0.5)), 0.3);
  };
  apply(layer);
  return {
    output: out,
    start: () => seq.start(0),
    stop: () => seq.stop(),
    update: apply,
    dispose: () =>
      [seq, kick, snare, snareBody, hat, hatFilter, tone, out].forEach((x) => x.dispose()),
  };
}

// ── Keys ──────────────────────────────────────────────────────────────────
function keysSynth(instrument: string): Tone.PolySynth {
  switch (instrument) {
    case 'piano':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' } as never,
        envelope: { attack: 0.005, decay: 1.2, sustain: 0.15, release: 1.8 },
        volume: -8,
      });
    case 'organ':
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'fatsine', count: 3, spread: 8 } as never,
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.9, release: 0.4 },
        volume: -12,
      });
    case 'bells':
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 3.01,
        modulationIndex: 14,
        envelope: { attack: 0.005, decay: 2.5, sustain: 0, release: 3 },
        modulationEnvelope: { attack: 0.005, decay: 0.8, sustain: 0, release: 1 },
        volume: -14,
      } as never);
    case 'guitar':
      return new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2,
        envelope: { attack: 0.01, decay: 1.4, sustain: 0.05, release: 1.2 },
        volume: -10,
      } as never);
    default: // rhodes
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 1.6,
        oscillator: { type: 'sine' } as never,
        envelope: { attack: 0.01, decay: 1.6, sustain: 0.25, release: 2.2 },
        modulation: { type: 'square' } as never,
        modulationEnvelope: { attack: 0.02, decay: 0.6, sustain: 0.1, release: 1 },
        volume: -10,
      } as never);
  }
}

function keys(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const tone = new Tone.Filter({ type: 'lowpass', frequency: 3000, Q: 0.6 });
  const wobble = new Tone.Vibrato({ frequency: 0.7, depth: 0.05 });
  let synth = keysSynth(s(layer.params.instrument, 'rhodes'));
  synth.chain(wobble, tone, out);
  const rng = makeRng(mix.seed + 33);
  let instrument = s(layer.params.instrument, 'rhodes');
  let cfg = {
    progression: s(layer.params.progression, 'lofi'),
    voicing: s(layer.params.voicing, 'seventh') as 'triad' | 'seventh',
    rhythm: s(layer.params.rhythm, 'half'),
    octave: oct(layer.params.octave, 4),
    humanize: n(layer.params.humanize, 0.4),
  };
  let currentMix = mix;
  const chordFor = (bar: number) =>
    chordAt({
      root: currentMix.root,
      scale: currentMix.scale,
      progression: cfg.progression,
      bar,
      octave: cfg.octave,
      voicing: cfg.voicing,
    });
  const strum = (notes: string[], dur: string, time: number, vel = 0.7) => {
    notes.forEach((note, i) => {
      const spread = i * 0.012 * (0.5 + cfg.humanize);
      const jitter = (rng() - 0.5) * 0.03 * cfg.humanize;
      synth.triggerAttackRelease(
        note,
        dur,
        time + spread + Math.max(0, jitter),
        vel * (1 - rng() * 0.2 * cfg.humanize),
      );
    });
  };
  const loop = new Tone.Loop((time) => {
    const { bar, beat: b } = grid(time);
    const beatIdx = bar * 4 + b;
    const chord = chordFor(bar);
    switch (cfg.rhythm) {
      case 'whole':
        if (b === 0) strum(chord, '1m', time, 0.65);
        break;
      case 'stabs':
        if (b === 1 || b === 3 || (b === 2 && rng() < 0.3))
          strum(chord, '8n', time + Tone.Time('8n').toSeconds() * (rng() < 0.5 ? 1 : 0), 0.6);
        break;
      case 'arp': {
        const note = chord[(beatIdx * 2) % chord.length]!;
        synth.triggerAttackRelease(note, '8n', time, 0.55);
        const note2 = chord[(beatIdx * 2 + 1) % chord.length]!;
        synth.triggerAttackRelease(note2, '8n', time + Tone.Time('8n').toSeconds(), 0.5);
        break;
      }
      default: // half
        if (b === 0 || b === 2) strum(chord, '2n', time, b === 0 ? 0.7 : 0.55);
    }
  }, '4n');
  const apply = (l: Layer, m: Mix) => {
    currentMix = m;
    cfg = {
      progression: s(l.params.progression, 'lofi'),
      voicing: s(l.params.voicing, 'seventh') as 'triad' | 'seventh',
      rhythm: s(l.params.rhythm, 'half'),
      octave: oct(l.params.octave, 4),
      humanize: n(l.params.humanize, 0.4),
    };
    wobble.depth.rampTo(n(l.params.wobble, 0.3) * 0.15, 0.3);
    tone.frequency.rampTo(lerp(600, 9000, n(l.params.tone, 0.55)), 0.3);
    const inst = s(l.params.instrument, 'rhodes');
    if (inst !== instrument) {
      instrument = inst;
      synth.releaseAll();
      synth.disconnect();
      synth.dispose();
      synth = keysSynth(inst);
      synth.connect(wobble);
    }
  };
  apply(layer, mix);
  return {
    output: out,
    start: () => loop.start(0),
    stop: () => {
      loop.stop();
      synth.releaseAll();
    },
    update: apply,
    dispose: () => [loop, synth, wobble, tone, out].forEach((x) => x.dispose()),
  };
}

// ── Bass ──────────────────────────────────────────────────────────────────
function bass(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const synth = new Tone.MonoSynth({
    oscillator: { type: 'triangle' } as never,
    filter: { type: 'lowpass', Q: 1, rolloff: -24 } as never,
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.6 },
    filterEnvelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.3,
      release: 0.5,
      baseFrequency: 120,
      octaves: 2.2,
    },
    portamento: n(layer.params.glide, 0.2) * 0.15,
    volume: -6,
  });
  synth.connect(out);
  const rng = makeRng(mix.seed + 45);
  let currentMix = mix;
  let cfg = {
    pattern: s(layer.params.pattern, 'root'),
    progression: s(layer.params.progression, 'lofi'),
    octave: oct(layer.params.octave, 2),
  };
  const loop = new Tone.Loop((time) => {
    const { bar, beat: b } = grid(time);
    const o = {
      root: currentMix.root,
      scale: currentMix.scale,
      progression: cfg.progression,
      bar,
      octave: cfg.octave,
    };
    switch (cfg.pattern) {
      case 'pulse':
        synth.triggerAttackRelease(bassAt(o), '8n', time, b === 0 ? 0.9 : 0.6);
        if (rng() < 0.5)
          synth.triggerAttackRelease(bassAt(o), '16n', time + Tone.Time('8n').toSeconds(), 0.45);
        break;
      case 'walk': {
        const steps = [0, 2, 4, rng() < 0.5 ? 5 : 6];
        synth.triggerAttackRelease(walkAt(o, steps[b]!), '4n', time, b === 0 ? 0.85 : 0.6);
        break;
      }
      default: // root: on the one, sometimes a pickup on the four
        if (b === 0) synth.triggerAttackRelease(bassAt(o), '2n', time, 0.85);
        else if (b === 3 && rng() < 0.4)
          synth.triggerAttackRelease(walkAt(o, 4), '8n', time + Tone.Time('8n').toSeconds(), 0.5);
    }
  }, '4n');
  const apply = (l: Layer, m: Mix) => {
    currentMix = m;
    cfg = {
      pattern: s(l.params.pattern, 'root'),
      progression: s(l.params.progression, 'lofi'),
      octave: oct(l.params.octave, 2),
    };
    synth.portamento = n(l.params.glide, 0.2) * 0.15;
    synth.filter.frequency.rampTo(lerp(120, 1400, n(l.params.tone, 0.4)), 0.3);
  };
  apply(layer, mix);
  return {
    output: out,
    start: () => loop.start(0),
    stop: () => {
      loop.stop();
      synth.triggerRelease();
    },
    update: apply,
    dispose: () => [loop, synth, out].forEach((x) => x.dispose()),
  };
}

// ── Vinyl ─────────────────────────────────────────────────────────────────
function vinyl(layer: Layer, mix: Mix): LayerRuntime {
  const out = new Tone.Gain(1);
  const rng = makeRng(mix.seed + 57);
  // dust: quiet pink bed with a slow wow
  const dust = new Tone.Noise('pink');
  const dustFilter = new Tone.Filter({ type: 'bandpass', frequency: 3000, Q: 0.5 });
  const dustGain = new Tone.Gain(0.15);
  const wow = new Tone.LFO({ frequency: 0.55, min: 0.08, max: 0.2 }).start();
  dust.chain(dustFilter, dustGain, out);
  wow.connect(dustGain.gain);
  // crackle: random pops
  const pop = new Tone.Noise('white');
  const popFilter = new Tone.Filter({ type: 'highpass', frequency: 2500 });
  const popEnv = new Tone.AmplitudeEnvelope({
    attack: 0.001,
    decay: 0.012,
    sustain: 0,
    release: 0.01,
  });
  const popGain = new Tone.Gain(0.5);
  pop.chain(popFilter, popEnv, popGain, out);
  // hum: mains
  const hum = new Tone.Oscillator({ frequency: 60, type: 'sine', volume: -40 });
  const humGain = new Tone.Gain(0.3);
  hum.chain(humGain, out);
  let chance = 0.35;
  const loop = new Tone.Loop((time) => {
    if (rng() < chance) popEnv.triggerAttackRelease(0.008, time + rng() * 0.05);
  }, '16n');
  const apply = (l: Layer) => {
    const crackle = n(l.params.crackle, 0.5);
    chance = crackle * 0.7;
    popGain.gain.rampTo(lerp(0.1, 0.8, crackle), 0.3);
    dustGain.gain.rampTo(lerp(0, 0.35, n(l.params.dust, 0.4)), 0.3);
    humGain.gain.rampTo(n(l.params.hum, 0.15), 0.3);
  };
  apply(layer);
  return {
    output: out,
    start: () => {
      dust.start();
      pop.start();
      hum.start();
      loop.start(0);
    },
    stop: () => {
      dust.stop();
      pop.stop();
      hum.stop();
      loop.stop();
    },
    update: apply,
    dispose: () =>
      [
        loop,
        wow,
        dust,
        dustFilter,
        dustGain,
        pop,
        popFilter,
        popEnv,
        popGain,
        hum,
        humGain,
        out,
      ].forEach((x) => x.dispose()),
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
    case 'beat':
      return beat(layer, mix);
    case 'keys':
      return keys(layer, mix);
    case 'bass':
      return bass(layer, mix);
    case 'vinyl':
      return vinyl(layer, mix);
  }
}
