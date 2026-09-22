import { parseSynthPatch, synthPreset, type SynthPatch, type SynthTrack } from './synth-patch';
import type { TrackSnapshot } from './track';

/** Four independent, slowly evolving voices. Audio time owns the envelopes; no file playback. */
export class SynthPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buses: GainNode[] = [];
  private voices = new Set<{ source: AudioScheduledSourceNode; nodes: AudioNode[] }>();
  private patch = synthPreset('glow');
  private next = [0, 0, 0, 0];
  private timer: ReturnType<typeof setInterval> | undefined;
  private volume = 0.7;
  private ducked = false;
  private active = false;
  private revision = 0;
  private listeners = new Set<(s: TrackSnapshot) => void>();
  private noise: AudioBuffer | null = null;
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
      const ctx = (this.ctx = new AudioContext());
      const master = (this.master = ctx.createGain());
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 12;
      limiter.ratio.value = 8;
      const analyser = (this.analyser = ctx.createAnalyser());
      analyser.fftSize = 512;
      master.gain.value = 0;
      this.buses = this.patch.tracks.map((t) => {
        const g = ctx.createGain();
        g.gain.value = t.muted ? 0 : t.level;
        g.connect(master);
        return g;
      });
      master.connect(limiter);
      limiter.connect(analyser);
      analyser.connect(ctx.destination);
      this.noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      let brown = 0;
      for (let i = 0; i < data.length; i++) {
        brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
        data[i] = brown * 3;
      }
    }
    return this.ctx;
  }
  configure(patch: SynthPatch) {
    this.patch = parseSynthPatch(patch);
    if (this.ctx)
      this.buses.forEach((b, i) =>
        b.gain.setTargetAtTime(
          this.patch.tracks[i]!.muted ? 0 : this.patch.tracks[i]!.level,
          this.ctx!.currentTime,
          0.2,
        ),
      );
  }
  async play() {
    const rev = ++this.revision;
    const ctx = this.context();
    await ctx.resume();
    if (rev !== this.revision || this.active) return;
    this.active = true;
    this.next = [0, 0.7, 1.4, 0.2].map((n) => ctx.currentTime + n);
    this.master!.gain.setTargetAtTime(this.target(), ctx.currentTime, 0.6);
    this.tick();
    this.timer = setInterval(() => this.tick(), 100);
  }
  pause() {
    ++this.revision;
    this.active = false;
    clearInterval(this.timer);
    this.timer = undefined;
    if (this.ctx) {
      this.master!.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      for (const voice of this.voices) {
        try {
          voice.source.stop(this.ctx.currentTime + 0.5);
        } catch {
          /* already ended */
        }
      }
    }
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
    return this.volume * (this.ducked ? 0.3 : 1) * 0.65;
  }
  private updateGain() {
    if (this.active && this.ctx)
      this.master!.gain.setTargetAtTime(this.target(), this.ctx.currentTime, 0.15);
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
    if (!this.active || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.patch.tracks.forEach((t, i) => {
      if (this.next[i]! > now + 0.2) return;
      const start = Math.max(now + 0.02, this.next[i]!);
      const interval =
        (t.voice === 'bell' ? 7 : 13) * (1.2 - t.movement * 0.8) * (0.85 + Math.random() * 0.3);
      if (!t.muted && t.level > 0) this.note(t, i, start, interval);
      this.next[i] = start + interval;
    });
    const samples = new Float32Array(512);
    this.analyser!.getFloatTimeDomainData(samples);
    this.emit(
      Math.min(1, Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length) * 4),
    );
  }
  private note(t: SynthTrack, i: number, start: number, interval: number) {
    const ctx = this.ctx!;
    const degrees = [0, 2, 4, 7, 9];
    const degree =
      t.voice === 'bass'
        ? [0, 7][Math.floor(Math.random() * 2)]!
        : degrees[Math.floor(Math.random() * degrees.length)]!;
    const midi =
      this.patch.root + degree + (t.voice === 'bass' ? -12 : t.voice === 'bell' ? 12 : 0);
    const hz = 440 * 2 ** ((midi - 69) / 12);
    const filter = ctx.createBiquadFilter();
    filter.type = t.voice === 'air' ? 'bandpass' : 'lowpass';
    filter.frequency.setValueAtTime(180 + t.tone ** 2 * 6500, start);
    filter.frequency.linearRampToValueAtTime(180 + t.tone ** 2 * 4300, start + interval);
    filter.Q.value = t.voice === 'air' ? 0.5 : 0.4;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.value = (i - 1.5) * 0.25;
    const duration = t.voice === 'bell' ? 6 : interval + 4;
    const attack = t.voice === 'bell' ? 0.015 : 2;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(t.voice === 'air' ? 0.12 : 0.1, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    gain.gain.linearRampToValueAtTime(0, start + duration + 0.1);
    let source: OscillatorNode | AudioBufferSourceNode;
    if (t.voice === 'air') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise;
      noise.loop = true;
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = t.voice === 'pad' ? 'triangle' : 'sine';
      osc.frequency.value = hz;
      osc.detune.setValueAtTime(-3, start);
      osc.detune.linearRampToValueAtTime(3 + t.movement * 5, start + duration);
      source = osc;
    }
    source.connect(filter);
    filter.connect(gain);
    gain.connect(pan);
    pan.connect(this.buses[i]!);
    const voice = { source, nodes: [source, filter, gain, pan] };
    this.voices.add(voice);
    source.onended = () => {
      voice.nodes.forEach((n) => n.disconnect());
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(start + duration + 0.15);
  }
}
export const synthPlayer = new SynthPlayer();
