/**
 * The Resonance engine: one master bus, one live Mix at a time, crossfades
 * between Mixes, live parameter updates, ducking, and a read model the Dock
 * and the tests observe. Tone.js is imported here only — everything else
 * talks to the engine through the audio store.
 */
import * as Tone from 'tone';
import type { Layer, Mix } from './schema';
import { buildLayer, type LayerRuntime } from './layers';
import { buildEffect, type EffectNode } from './effects';

interface LiveLayer {
  def: Layer;
  runtime: LayerRuntime;
  effects: EffectNode[];
  effectsKey: string;
  panner: Tone.Panner;
  gain: Tone.Gain;
}

class MixRuntime {
  readonly input = new Tone.Gain(0);
  private layers = new Map<string, LiveLayer>();
  constructor(public mix: Mix) {
    for (const l of mix.layers) this.addLayer(l);
  }

  private wire(live: LiveLayer) {
    live.runtime.output.disconnect();
    let prev: Tone.ToneAudioNode = live.runtime.output;
    for (const e of live.effects) {
      prev.connect(e.input);
      prev = e.output;
    }
    prev.chain(live.panner, live.gain, this.input);
  }

  private addLayer(def: Layer) {
    const runtime = buildLayer(def, this.mix);
    const effects = def.effects.map(buildEffect);
    const live: LiveLayer = {
      def,
      runtime,
      effects,
      effectsKey: JSON.stringify(def.effects.map((e) => [e.type, e.enabled])),
      panner: new Tone.Panner(def.pan),
      gain: new Tone.Gain(def.muted ? 0 : Tone.dbToGain(def.gain)),
    };
    this.wire(live);
    this.layers.set(def.id, live);
    return live;
  }

  private removeLayer(id: string) {
    const live = this.layers.get(id);
    if (!live) return;
    live.runtime.stop();
    live.runtime.dispose();
    live.effects.forEach((e) => e.dispose());
    live.panner.dispose();
    live.gain.dispose();
    this.layers.delete(id);
  }

  start() {
    for (const l of this.layers.values()) l.runtime.start();
  }
  stop() {
    for (const l of this.layers.values()) l.runtime.stop();
  }

  /** Apply a new version of the same Mix: add/remove/update layers in place. */
  update(mix: Mix, playing: boolean) {
    this.mix = mix;
    const seen = new Set<string>();
    for (const def of mix.layers) {
      seen.add(def.id);
      const live = this.layers.get(def.id);
      if (!live) {
        const added = this.addLayer(def);
        if (playing) added.runtime.start();
        continue;
      }
      if (live.def.type !== def.type) {
        this.removeLayer(def.id);
        const added = this.addLayer(def);
        if (playing) added.runtime.start();
        continue;
      }
      const key = JSON.stringify(def.effects.map((e) => [e.type, e.enabled]));
      if (key !== live.effectsKey) {
        live.effects.forEach((e) => e.dispose());
        live.effects = def.effects.map(buildEffect);
        live.effectsKey = key;
        this.wire(live);
      } else {
        def.effects.forEach((e, i) => live.effects[i]?.update(e));
      }
      live.panner.pan.rampTo(def.pan, 0.2);
      live.gain.gain.rampTo(def.muted ? 0 : Tone.dbToGain(def.gain), 0.2);
      live.runtime.update(def, mix);
      live.def = def;
    }
    for (const id of [...this.layers.keys()]) if (!seen.has(id)) this.removeLayer(id);
  }

  dispose() {
    for (const id of [...this.layers.keys()]) this.removeLayer(id);
    this.input.dispose();
  }
}

export interface EngineSnapshot {
  contextState: 'suspended' | 'running' | 'closed' | 'none';
  playing: boolean;
  mixId: string | null;
  layerCount: number;
  level: number;
  ducked: boolean;
}

class Engine {
  private started = false;
  private master?: {
    input: Tone.Gain;
    reverb: Tone.Reverb;
    compressor: Tone.Compressor;
    limiter: Tone.Limiter;
    volume: Tone.Gain;
    meter: Tone.Meter;
    duck: Tone.Gain;
  };
  private current: MixRuntime | null = null;
  private fading: MixRuntime[] = [];
  private playing = false;
  private volume01 = 0.7;
  private ducked = false;
  private listeners = new Set<(s: EngineSnapshot) => void>();

  onChange(fn: (s: EngineSnapshot) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  snapshot(): EngineSnapshot {
    let contextState: EngineSnapshot['contextState'] = 'none';
    if (this.started)
      contextState = Tone.getContext().rawContext.state as EngineSnapshot['contextState'];
    return {
      contextState,
      playing: this.playing,
      mixId: this.current?.mix.id ?? null,
      layerCount: this.current?.mix.layers.length ?? 0,
      level: this.master ? (this.master.meter.getValue() as number) : 0,
      ducked: this.ducked,
    };
  }

  /** Must be called from a user gesture the first time (autoplay policy). */
  async ensureStarted() {
    if (this.started) {
      if (Tone.getContext().rawContext.state === 'suspended')
        await Tone.getContext().rawContext.resume();
      return;
    }
    await Tone.start();
    const input = new Tone.Gain(1);
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.25 });
    const compressor = new Tone.Compressor({ threshold: -18, ratio: 3 });
    const limiter = new Tone.Limiter(-1);
    const duck = new Tone.Gain(1);
    const volume = new Tone.Gain(this.volume01 * this.volume01);
    const meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 });
    input.chain(reverb, compressor, limiter, duck, volume, Tone.getDestination());
    volume.connect(meter);
    this.master = { input, reverb, compressor, limiter, volume, meter, duck };
    Tone.getTransport().start();
    this.started = true;
    setInterval(() => this.emit(), 120);
  }

  /** Play a Mix, crossfading from whatever is live. */
  async play(mix: Mix, crossfadeSec = 2.5) {
    await this.ensureStarted();
    const m = this.master!;
    if (this.current && this.current.mix.id === mix.id) {
      this.current.update(mix, true);
      if (!this.playing) {
        this.current.start();
        this.current.input.gain.rampTo(1, crossfadeSec);
        this.playing = true;
      }
    } else {
      const next = new MixRuntime(mix);
      next.input.connect(m.input);
      next.start();
      next.input.gain.rampTo(1, crossfadeSec);
      if (this.current) {
        const old = this.current;
        old.input.gain.rampTo(0, crossfadeSec);
        this.fading.push(old);
        setTimeout(
          () => {
            old.stop();
            old.dispose();
            this.fading = this.fading.filter((f) => f !== old);
          },
          crossfadeSec * 1000 + 200,
        );
      }
      this.current = next;
      this.playing = true;
    }
    Tone.getTransport().bpm.rampTo(mix.tempo, 1);
    m.reverb.decay = mix.master.reverbDecay;
    m.reverb.wet.rampTo(mix.master.reverbWet, 0.5);
    this.emit();
  }

  /** Live edit of the playing (or loaded) Mix. */
  update(mix: Mix) {
    if (!this.current || this.current.mix.id !== mix.id) return;
    this.current.update(mix, this.playing);
    if (this.master) {
      this.master.reverb.decay = mix.master.reverbDecay;
      this.master.reverb.wet.rampTo(mix.master.reverbWet, 0.5);
    }
    Tone.getTransport().bpm.rampTo(mix.tempo, 1);
    this.emit();
  }

  pause(fadeSec = 1.2) {
    if (!this.current || !this.playing) return;
    const cur = this.current;
    cur.input.gain.rampTo(0, fadeSec);
    this.playing = false;
    setTimeout(
      () => {
        if (!this.playing && this.current === cur) cur.stop();
      },
      fadeSec * 1000 + 100,
    );
    this.emit();
  }

  setVolume(v01: number) {
    this.volume01 = Math.min(1, Math.max(0, v01));
    // perceptual-ish curve
    this.master?.volume.gain.rampTo(this.volume01 * this.volume01, 0.1);
    this.emit();
  }

  /** Dip the whole mix (the AI speaks, a Sound Cue plays). */
  duck(on: boolean, db = -10, ms = 250) {
    this.ducked = on;
    this.master?.duck.gain.rampTo(on ? Tone.dbToGain(db) : 1, ms / 1000);
    this.emit();
  }

  /** A short one-shot sound over the mix (Sound Cues). */
  async cue(kind: 'chime' | 'tick' | 'bloom' | 'thud', volumeDb = -14) {
    await this.ensureStarted();
    const m = this.master!;
    const synth = new Tone.Synth({
      oscillator: { type: kind === 'thud' ? 'sine' : 'triangle' },
      envelope: { attack: 0.005, decay: kind === 'bloom' ? 1.2 : 0.25, sustain: 0, release: 0.4 },
      volume: volumeDb,
    }).connect(m.compressor);
    const now = Tone.now();
    if (kind === 'chime') {
      synth.triggerAttackRelease('E5', '16n', now);
      synth.triggerAttackRelease('B5', '8n', now + 0.12);
    } else if (kind === 'tick') synth.triggerAttackRelease('A6', '32n', now);
    else if (kind === 'bloom') {
      synth.triggerAttackRelease('D4', '4n', now);
      synth.triggerAttackRelease('A4', '4n', now + 0.15);
      synth.triggerAttackRelease('D5', '2n', now + 0.3);
    } else synth.triggerAttackRelease('D2', '8n', now);
    setTimeout(() => synth.dispose(), 3000);
  }

  suspend() {
    if (this.started && Tone.getContext().rawContext.state === 'running')
      void (Tone.getContext().rawContext as AudioContext).suspend();
  }
  resume() {
    if (this.started && this.playing) void Tone.getContext().rawContext.resume();
  }
}

export const engine = new Engine();
