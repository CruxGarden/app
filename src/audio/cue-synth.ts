/**
 * The cue synth (SYNTH-CUES-PLAN, extends ADR 0017): a Sound Cue is a small
 * patch a tiny WebAudio engine plays, never an audio file. Presets are
 * patches that ship with the app; "craft your own" edits a patch. The patch
 * travels in the Mood Package, so a Mood's voice stays in its register and
 * costs bytes, not megabytes.
 *
 * Everything here is plain WebAudio scheduled against any BaseAudioContext,
 * so a test can render a patch through an OfflineAudioContext or a fake and
 * check what it asked for, and the app plays it through the track player's
 * context so ducking and cues never fight over devices.
 */

export type CueWave = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';

export interface CueVoice {
  wave: CueWave;
  /** Note names (C0–B8, with # or b) played in sequence; one onset per note. */
  notes: string[];
  /** Onset of each note in seconds from the cue's start; same length as notes. */
  at: number[];
  /** How long each note holds before release, seconds. */
  dur: number;
  /** Envelope, seconds; sustain is a level 0..1. */
  attack: number;
  decay?: number;
  sustain?: number;
  release: number;
  /** Voice level 0..1 before the patch gain. */
  level: number;
  /** Cents, applied to every note. */
  detune?: number;
}

export interface CuePatch {
  version: 1;
  name: string;
  voices: CueVoice[];
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; hz: number; q?: number };
  fx?: {
    /** Delay time and feedback 0..0.9. */
    delay?: { time: number; feedback: number };
    /** Bit depth 2..16; anything below 16 crushes. */
    bitcrush?: number;
  };
  /** 0..1, then scaled by the Mood's cue level. */
  gain: number;
}

/** Longest a cue may sound, seconds — a cue is an accent, not a track. */
export const CUE_MAX_SECONDS = 3;
const MAX_VOICES = 4;
const MAX_NOTES = 12;
const WAVES: CueWave[] = ['sine', 'triangle', 'square', 'sawtooth', 'noise'];

const SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A note name to hertz; equal temperament, A4 = 440. */
export function noteHz(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note.trim());
  if (!m) throw new Error(`Not a note: ${note}`);
  const semis =
    SEMITONES[m[1]!]! + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * Math.pow(2, (semis - 69) / 12);
}

function num(v: unknown, lo: number, hi: number, what: string, fallback?: number): number {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)
    throw new Error(`Cue ${what} must be a number between ${lo} and ${hi}`);
  return v;
}

/** Validate a patch from a Mood Package or an editor; bounded so a bad file cannot scream. */
export function parseCuePatch(raw: unknown): CuePatch {
  if (!raw || typeof raw !== 'object') throw new Error('A cue patch must be an object');
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) throw new Error('Cue patch version must be 1');
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 40) : 'Cue';
  if (!Array.isArray(o.voices) || !o.voices.length || o.voices.length > MAX_VOICES)
    throw new Error(`A cue needs 1 to ${MAX_VOICES} voices`);
  const voices: CueVoice[] = o.voices.map((v, i) => {
    if (!v || typeof v !== 'object') throw new Error(`Voice ${i + 1} must be an object`);
    const vo = v as Record<string, unknown>;
    if (!WAVES.includes(vo.wave as CueWave)) throw new Error(`Voice ${i + 1} wave is unknown`);
    if (!Array.isArray(vo.notes) || !vo.notes.length || vo.notes.length > MAX_NOTES)
      throw new Error(`Voice ${i + 1} needs 1 to ${MAX_NOTES} notes`);
    const notes = vo.notes.map((n) => {
      if (typeof n !== 'string') throw new Error(`Voice ${i + 1} has a note that is not a name`);
      noteHz(n);
      return n;
    });
    if (!Array.isArray(vo.at) || vo.at.length !== notes.length)
      throw new Error(`Voice ${i + 1} needs one onset per note`);
    const at = vo.at.map((t) => num(t, 0, CUE_MAX_SECONDS, 'onset'));
    return {
      wave: vo.wave as CueWave,
      notes,
      at,
      dur: num(vo.dur, 0.005, CUE_MAX_SECONDS, 'duration'),
      attack: num(vo.attack, 0, 1, 'attack', 0.005),
      decay: num(vo.decay, 0, 1, 'decay', 0),
      sustain: num(vo.sustain, 0, 1, 'sustain', 1),
      release: num(vo.release, 0.005, CUE_MAX_SECONDS, 'release'),
      level: num(vo.level, 0, 1, 'level', 1),
      detune: num(vo.detune, -1200, 1200, 'detune', 0),
    };
  });
  let filter: CuePatch['filter'];
  if (o.filter !== undefined) {
    const f = (o.filter ?? {}) as Record<string, unknown>;
    if (!['lowpass', 'highpass', 'bandpass'].includes(f.type as string))
      throw new Error('Cue filter type is unknown');
    filter = {
      type: f.type as 'lowpass',
      hz: num(f.hz, 20, 20000, 'filter frequency'),
      q: num(f.q, 0.1, 30, 'filter q', 1),
    };
  }
  let fx: CuePatch['fx'];
  if (o.fx !== undefined) {
    const x = (o.fx ?? {}) as Record<string, unknown>;
    fx = {};
    if (x.delay !== undefined) {
      const d = (x.delay ?? {}) as Record<string, unknown>;
      fx.delay = {
        time: num(d.time, 0.01, 1, 'delay time'),
        feedback: num(d.feedback, 0, 0.9, 'delay feedback'),
      };
    }
    if (x.bitcrush !== undefined) fx.bitcrush = num(x.bitcrush, 2, 16, 'bit depth');
  }
  const patch: CuePatch = { version: 1, name, voices, gain: num(o.gain, 0, 1, 'gain', 0.18) };
  if (filter) patch.filter = filter;
  if (fx && (fx.delay || fx.bitcrush !== undefined)) patch.fx = fx;
  if (cueLength(patch) > CUE_MAX_SECONDS + 1)
    throw new Error(`A cue may not sound longer than ${CUE_MAX_SECONDS} seconds`);
  return patch;
}

/** How long the patch sounds, seconds, tail included. */
export function cueLength(patch: CuePatch): number {
  let end = 0;
  for (const v of patch.voices) for (const t of v.at) end = Math.max(end, t + v.dur + v.release);
  if (patch.fx?.delay) end += patch.fx.delay.time * 3;
  return end;
}

/**
 * The slice of BaseAudioContext the engine touches — an OfflineAudioContext
 * satisfies it, and so does a small fake in a test.
 */
export interface CueContext {
  currentTime: number;
  sampleRate: number;
  destination: AudioNode;
  createOscillator(): OscillatorNode;
  createGain(): GainNode;
  createBiquadFilter(): BiquadFilterNode;
  createDelay(maxDelayTime?: number): DelayNode;
  createWaveShaper(): WaveShaperNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer;
  createBufferSource(): AudioBufferSourceNode;
}

let noiseCache: WeakMap<CueContext, AudioBuffer> | null = null;
function noiseBuffer(ctx: CueContext): AudioBuffer {
  noiseCache ??= new WeakMap();
  let buf = noiseCache.get(ctx);
  if (buf) return buf;
  const seconds = 1;
  buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  // Deterministic white noise: the same "seed" everywhere, so a cue sounds the same twice.
  let x = 0x2f6e2b1;
  for (let i = 0; i < data.length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = ((x >>> 0) / 0xffffffff) * 2 - 1;
  }
  noiseCache.set(ctx, buf);
  return buf;
}

function crushCurve(bits: number): Float32Array<ArrayBuffer> {
  const steps = Math.pow(2, bits);
  const curve = new Float32Array(new ArrayBuffer(1024 * 4));
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * steps) / steps;
  }
  return curve;
}

/**
 * Schedule the patch on the context starting at `at`; returns when the sound
 * ends. `level` scales the patch gain (the Mood's cue level, 0..1).
 */
export function scheduleCue(ctx: CueContext, patch: CuePatch, at = ctx.currentTime, level = 1) {
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, patch.gain * level));
  let head: AudioNode = out;
  if (patch.fx?.bitcrush !== undefined && patch.fx.bitcrush < 16) {
    const crush = ctx.createWaveShaper();
    crush.curve = crushCurve(patch.fx.bitcrush);
    crush.connect(head);
    head = crush;
  }
  if (patch.filter) {
    const f = ctx.createBiquadFilter();
    f.type = patch.filter.type;
    f.frequency.value = patch.filter.hz;
    f.Q.value = patch.filter.q ?? 1;
    f.connect(head);
    head = f;
  }
  if (patch.fx?.delay) {
    const d = ctx.createDelay(1);
    d.delayTime.value = patch.fx.delay.time;
    const fb = ctx.createGain();
    fb.gain.value = patch.fx.delay.feedback;
    d.connect(fb);
    fb.connect(d);
    d.connect(head);
    // dry stays on `head`; wet joins through the delay
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    wet.connect(d);
    head = mergeInto(ctx, head, wet);
  }
  out.connect(ctx.destination);

  let end = at;
  for (const voice of patch.voices) {
    voice.notes.forEach((note, i) => {
      const start = at + voice.at[i]!;
      const hold = voice.dur;
      const release = voice.release;
      const stop = start + voice.attack + (voice.decay ?? 0) + hold + release;
      end = Math.max(end, stop);
      const g = ctx.createGain();
      const peak = voice.level;
      const sustain = peak * (voice.sustain ?? 1);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(peak, start + voice.attack);
      const afterDecay = start + voice.attack + (voice.decay ?? 0);
      if ((voice.decay ?? 0) > 0) g.gain.linearRampToValueAtTime(sustain, afterDecay);
      g.gain.setValueAtTime(sustain, afterDecay + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, stop);
      g.connect(head);
      if (voice.wave === 'noise') {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx);
        src.loop = true;
        src.connect(g);
        src.start(start);
        src.stop(stop + 0.05);
      } else {
        const osc = ctx.createOscillator();
        osc.type = voice.wave;
        osc.frequency.value = noteHz(note);
        if (voice.detune) osc.detune.value = voice.detune;
        osc.connect(g);
        osc.start(start);
        osc.stop(stop + 0.05);
      }
    });
  }
  if (patch.fx?.delay) end += patch.fx.delay.time * 3;
  return end;
}

/** Route voices to both a dry path and a wet path through one gain. */
function mergeInto(ctx: CueContext, dry: AudioNode, wet: AudioNode): AudioNode {
  const split = ctx.createGain();
  split.gain.value = 1;
  split.connect(dry);
  split.connect(wet);
  return split;
}

let own: AudioContext | null = null;

/** Play a patch now, through the given context or the engine's own. */
export async function playCuePatch(
  patch: CuePatch,
  ctx?: AudioContext | null,
  level = 1,
): Promise<void> {
  if (typeof AudioContext === 'undefined') return;
  const c = ctx ?? (own ??= new AudioContext());
  if (c.state === 'suspended') await c.resume().catch(() => {});
  scheduleCue(c, patch, c.currentTime, level);
}
