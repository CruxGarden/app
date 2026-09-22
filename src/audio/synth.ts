import { parseSynthPatch, synthPreset, type SynthPatch } from './synth-patch';
import type { TrackSnapshot } from './track';
import { SynthGraph } from './synth-graph';
import { SynthScore, synthRandom } from './synth-score';

/** Musical transport, separate from the graph so offline renders exercise the real instrument. */
export class SynthPlayer {
  private ctx: AudioContext | null = null;
  private graph: SynthGraph | null = null;
  private score = new SynthScore();
  private origin = 0;
  private patch = synthPreset('glow');
  private timer: ReturnType<typeof setInterval> | undefined;
  private volume = 0.7;
  private ducked = false;
  private active = false;
  private revision = 0;
  private samples = new Float32Array(1024);
  private listeners = new Set<(s: TrackSnapshot) => void>();
  onChange(fn: (s: TrackSnapshot) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  get playing() {
    return this.active;
  }
  context() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.graph = new SynthGraph(this.ctx, this.patch);
    }
    return this.ctx;
  }
  configure(patch: SynthPatch) {
    const next = parseSynthPatch(patch);
    // Begin a fresh phrase after a harmony/tempo/voice change. Existing envelopes
    // release naturally; levels and mute act immediately on the shared track buses.
    if (
      next.root !== this.patch.root ||
      next.mode !== this.patch.mode ||
      next.tempo !== this.patch.tempo ||
      next.tracks.some((t, i) => t.voice !== this.patch.tracks[i]!.voice)
    ) {
      this.graph?.releaseVoices();
      this.score = new SynthScore();
      if (this.ctx) this.origin = this.ctx.currentTime + 0.08;
    }
    this.patch = next;
    this.graph?.configure(next);
  }
  async play() {
    const revision = ++this.revision;
    const ctx = this.context();
    await ctx.resume();
    if (revision !== this.revision || this.active) return;
    this.active = true;
    this.score = new SynthScore();
    this.origin = ctx.currentTime + 0.05;
    this.graph!.master.gain.setTargetAtTime(this.target(), ctx.currentTime, 0.6);
    this.tick();
    this.timer = setInterval(() => this.tick(), 80);
  }
  pause() {
    ++this.revision;
    this.active = false;
    clearInterval(this.timer);
    this.timer = undefined;
    this.graph?.stop();
    this.emit(0);
  }
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.updateGain();
  }
  duck(on: boolean) {
    this.ducked = on;
    this.updateGain();
  }
  private target() {
    return this.volume * (this.ducked ? 0.3 : 1) * 0.85;
  }
  private updateGain() {
    if (this.active && this.ctx)
      this.graph!.master.gain.setTargetAtTime(this.target(), this.ctx.currentTime, 0.15);
  }
  private emit(level: number) {
    this.listeners.forEach((fn) =>
      fn({
        level,
        ducked: this.ducked,
        contextState: this.ctx?.state === 'interrupted' ? 'suspended' : (this.ctx?.state ?? 'none'),
      }),
    );
  }
  private tick() {
    if (!this.active || !this.ctx || !this.graph) return;
    const now = this.ctx.currentTime - this.origin;
    this.score.take(this.patch, Math.max(0, now), now + 0.25, (t, i, n) =>
      this.graph!.note(t, i, {
        ...n,
        time: Math.max(this.ctx!.currentTime + 0.015, this.origin + n.time),
      }),
    );
    this.graph.analyser.getFloatTimeDomainData(this.samples);
    this.emit(
      Math.min(
        1,
        Math.sqrt(this.samples.reduce((sum, n) => sum + n * n, 0) / this.samples.length) * 4,
      ),
    );
  }
}

/** Bounded, deterministic listening/evidence render; uses the live score and voice graph. */
export async function renderSynth(
  raw: SynthPatch,
  seconds = 60,
  seed = 42,
  sampleRate = 44100,
): Promise<AudioBuffer> {
  const patch = parseSynthPatch(raw);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 180)
    throw new Error('Render duration must be 1–180 seconds');
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = new SynthGraph(ctx, patch);
  const score = new SynthScore(synthRandom(seed));
  graph.master.gain.setValueAtTime(0, 0);
  const fade = Math.min(1.5, seconds * 0.2);
  graph.master.gain.linearRampToValueAtTime(0.7 * 0.85, fade);
  graph.master.gain.setValueAtTime(
    0.7 * 0.85,
    Math.max(fade, seconds - Math.min(3, seconds * 0.3)),
  );
  graph.master.gain.linearRampToValueAtTime(0, seconds);
  score.take(patch, 0, Math.max(0, seconds - 4), (t, i, n) => graph.note(t, i, n));
  return ctx.startRendering();
}
export const synthPlayer = new SynthPlayer();
