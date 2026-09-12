/**
 * The Mood's sound is one looping track. This plays it: an <audio> element
 * (streams from disk, loops gaplessly for Opus/AAC, never decodes the whole
 * file into memory) through a gain node for fades and ducking, and an
 * analyser for the level bars. Nothing here knows about Moods or settings —
 * the store does; this is the machine.
 */
export interface TrackSnapshot {
  level: number; // 0..1, smoothed
  contextState: 'suspended' | 'running' | 'closed' | 'none';
  ducked: boolean;
}

const FADE_SEC = 0.6;
const DUCK_GAIN = 0.3;

export class TrackPlayer {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array | null = null;
  private src: string | null = null;
  private sourceRevision = 0;
  private volume = 0.7;
  private ducked = false;
  private level = 0;
  private raf = 0;
  private listeners = new Set<(s: TrackSnapshot) => void>();

  onChange(fn: (s: TrackSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap: TrackSnapshot = {
      level: this.level,
      contextState: (this.ctx?.state as TrackSnapshot['contextState']) ?? 'none',
      ducked: this.ducked,
    };
    this.listeners.forEach((fn) => fn(snap));
  }

  private ensureGraph() {
    if (this.el) return;
    const el = new Audio();
    el.loop = true;
    el.preload = 'auto';
    // Same-origin sources only (blob: and the app's own files): no crossOrigin,
    // which would turn a plain file request into a CORS one the app scheme rejects.
    this.el = el;
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);
      gain.gain.value = 0;
      this.ctx = ctx;
      this.gain = gain;
      this.analyser = analyser;
      this.data = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // No WebAudio (or a source that refuses the graph): the element plays on its own.
      el.volume = this.volume;
    }
  }

  private target(): number {
    return this.volume * (this.ducked ? DUCK_GAIN : 1);
  }

  private ramp(to: number, sec = FADE_SEC) {
    if (this.gain && this.ctx) {
      const g = this.gain.gain;
      const now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(to, now + sec);
    } else if (this.el) {
      this.el.volume = Math.min(1, Math.max(0, to));
    }
  }

  private tick = () => {
    if (this.analyser && this.data) {
      this.analyser.getByteFrequencyData(this.data as Uint8Array<ArrayBuffer>);
      let sum = 0;
      for (let i = 0; i < this.data.length; i++) sum += this.data[i]! * this.data[i]!;
      const rms = Math.sqrt(sum / this.data.length) / 255;
      this.level = this.level * 0.7 + rms * 0.3;
    } else {
      this.level = this.el && !this.el.paused ? 0.4 : 0;
    }
    this.emit();
    this.raf = requestAnimationFrame(this.tick);
  };

  private startMeter() {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }
  private stopMeter() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.level = 0;
    this.emit();
  }

  /** Point the player at a file; a change while playing restarts on the new one. */
  async load(src: string): Promise<void> {
    this.ensureGraph();
    if (this.src === src) return;
    const wasPlaying = this.playing;
    this.src = src;
    this.sourceRevision++;
    this.el!.src = src;
    if (wasPlaying) await this.play();
  }

  get playing(): boolean {
    return !!this.el && !this.el.paused && !this.el.ended;
  }

  async play(): Promise<void> {
    this.ensureGraph();
    if (!this.src || !this.el) return;
    const revision = this.sourceRevision;
    if (this.ctx?.state === 'suspended') await this.ctx.resume().catch(() => {});
    if (revision !== this.sourceRevision) return;
    try {
      await this.el.play();
    } catch (error) {
      // Changing the Mood can replace src before Chromium acknowledges play.
      // Only that superseded AbortError is cancellation; other failures remain visible.
      if (revision !== this.sourceRevision && error instanceof Error && error.name === 'AbortError')
        return;
      throw error;
    }
    if (revision !== this.sourceRevision) return;
    this.ramp(this.target());
    this.startMeter();
  }

  pause(): void {
    if (!this.el) return;
    this.ramp(0, FADE_SEC / 2);
    const el = this.el;
    setTimeout(() => {
      if (this.el === el && !this.gain) el.pause();
      else if (this.el === el) el.pause();
    }, FADE_SEC * 500);
    this.stopMeter();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.playing) this.ramp(this.target(), 0.15);
  }

  duck(on: boolean): void {
    this.ducked = on;
    if (this.playing) this.ramp(this.target(), 0.4);
    this.emit();
  }

  /** The AudioContext other short sounds (cues) may share. */
  context(): AudioContext | null {
    this.ensureGraph();
    return this.ctx;
  }
}

export const trackPlayer = new TrackPlayer();
