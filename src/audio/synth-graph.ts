import type { SynthPatch, SynthTrack } from './synth-patch';
import { synthRandom, type SynthNote } from './synth-score';

/** The exact same graph renders offline examples and the live instrument. */
export class SynthGraph {
  readonly master: GainNode;
  readonly analyser: AnalyserNode;
  readonly voices = new Set<{
    sources: AudioScheduledSourceNode[];
    nodes: AudioNode[];
    envelope: GainNode;
  }>();
  private buses: GainNode[] = [];
  private inputs: GainNode[] = [];
  private wet: GainNode[] = [];
  private noise: AudioBuffer;
  constructor(
    readonly ctx: BaseAudioContext,
    patch: SynthPatch,
  ) {
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.025;
    compressor.release.value = 0.6;
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 25;
    highpass.Q.value = 0.5;
    const warmth = ctx.createGain();
    warmth.gain.value = 3;
    highpass.connect(warmth);
    warmth.connect(compressor);
    compressor.connect(this.master);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    // Decorrelated stereo diffusion; no samples, downloaded audio or third-party assets.
    const random = synthRandom(6217);
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 3.8), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let smooth = 0;
      for (let n = 0; n < data.length; n++) {
        const time = n / ctx.sampleRate;
        smooth = smooth * 0.55 + (random() * 2 - 1) * 0.45;
        data[n] =
          time < 0.022 ? 0 : smooth * Math.exp(-time * 2.1) * Math.min(1, (time - 0.022) * 70);
      }
    }
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let brown = 0;
    for (let n = 0; n < data.length; n++) {
      brown = (brown + (random() * 2 - 1) * 0.04) / 1.04;
      data[n] = brown * 3;
    }
    for (let i = 0; i < 4; i++) {
      const input = ctx.createGain();
      const bus = ctx.createGain();
      const reverb = ctx.createConvolver();
      reverb.buffer = impulse;
      const wet = ctx.createGain();
      const damping = ctx.createBiquadFilter();
      damping.type = 'lowpass';
      damping.frequency.value = 4200;
      // Effects precede each track bus, so mute silences existing tails as well.
      input.connect(bus);
      input.connect(reverb);
      reverb.connect(damping);
      damping.connect(wet);
      wet.connect(bus);
      bus.connect(highpass);
      this.inputs.push(input);
      this.buses.push(bus);
      this.wet.push(wet);
    }
    this.configure(patch, 0);
  }
  configure(patch: SynthPatch, now = this.ctx.currentTime) {
    this.buses.forEach((bus, i) => {
      const t = patch.tracks[i]!;
      bus.gain.setTargetAtTime(t.muted ? 0 : t.level, now, 0.06);
      this.wet[i]!.gain.setTargetAtTime(patch.space * (t.voice === 'bass' ? 0.15 : 1.1), now, 0.25);
    });
  }
  note(track: SynthTrack, index: number, note: SynthNote) {
    const ctx = this.ctx;
    const start = note.time;
    const end = start + note.duration;
    const nodes: AudioNode[] = [];
    const sources: AudioScheduledSourceNode[] = [];
    const filter = ctx.createBiquadFilter();
    filter.type = track.voice === 'air' ? 'bandpass' : 'lowpass';
    const cutoff = track.voice === 'bass' ? 160 + track.tone * 850 : 450 + track.tone ** 2 * 7000;
    filter.frequency.setValueAtTime(cutoff * 0.65, start);
    filter.frequency.linearRampToValueAtTime(cutoff, start + Math.min(3, note.duration / 3));
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.5), end);
    filter.Q.value = track.voice === 'air' ? 0.7 : 0.45;
    const envelope = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const width = track.voice === 'bass' ? 0 : (index - 1.5) * 0.2;
    pan.pan.setValueAtTime(width - 0.06, start);
    pan.pan.linearRampToValueAtTime(width + 0.06, end);
    const attack =
      track.voice === 'bell'
        ? 0.035
        : track.voice === 'bass'
          ? 0.18
          : Math.min(3, note.duration / 4);
    const amplitude =
      (track.voice === 'air'
        ? 0.13
        : track.voice === 'pad'
          ? 0.14
          : track.voice === 'bass'
            ? 0.23
            : 0.16) * note.strength;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(amplitude, start + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    envelope.gain.linearRampToValueAtTime(0, end + 0.12);
    filter.connect(envelope);
    envelope.connect(pan);
    pan.connect(this.inputs[index]!);
    nodes.push(filter, envelope, pan);
    const oscillator = (
      midi: number,
      ratio: number,
      type: OscillatorType,
      gain: number,
      detune: number,
      decay = 0,
    ) => {
      const osc = ctx.createOscillator();
      const level = ctx.createGain();
      osc.type = type;
      osc.frequency.value = 440 * 2 ** ((midi - 69) / 12) * ratio;
      osc.detune.setValueAtTime(detune - track.movement * 1.5, start);
      osc.detune.linearRampToValueAtTime(detune + track.movement * 1.5, end);
      level.gain.setValueAtTime(gain, start);
      if (decay)
        level.gain.exponentialRampToValueAtTime(0.0001, start + Math.min(note.duration, decay));
      osc.connect(level);
      level.connect(filter);
      nodes.push(osc, level);
      sources.push(osc);
    };
    for (const midi of note.notes) {
      if (track.voice === 'pad') {
        oscillator(midi, 1, 'triangle', 0.19, -4);
        oscillator(midi, 1, 'sine', 0.23, 4);
      } else if (track.voice === 'bass') {
        oscillator(midi, 1, 'sine', 0.85, 0);
        oscillator(midi, 2, 'triangle', 0.12, 1);
      } else if (track.voice === 'bell') {
        oscillator(midi, 1, 'sine', 0.75, 0);
        oscillator(midi, 2, 'sine', 0.2, 1, 3);
        oscillator(midi, 3.002, 'sine', 0.09 * track.tone, -1, 1.5);
        oscillator(midi, 4.005, 'sine', 0.04 * track.tone, 2, 0.7);
      } else {
        const source = ctx.createBufferSource();
        source.buffer = this.noise;
        source.loop = true;
        source.connect(filter);
        sources.push(source);
        nodes.push(source);
      }
    }
    const voice = { sources, nodes, envelope };
    this.voices.add(voice);
    let remaining = sources.length;
    sources.forEach((source) => {
      source.onended = () => {
        if (--remaining === 0) {
          nodes.forEach((n) => n.disconnect());
          this.voices.delete(voice);
        }
      };
      source.start(start);
      source.stop(end + 0.15);
    });
  }
  releaseVoices() {
    const now = this.ctx.currentTime;
    for (const voice of this.voices) {
      voice.envelope.gain.cancelAndHoldAtTime(now);
      voice.envelope.gain.setTargetAtTime(0, now, 0.18);
      for (const source of voice.sources)
        try {
          source.stop(now + 1.2);
        } catch {
          /* already ended */
        }
    }
  }
  stop() {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.06);
    for (const voice of this.voices)
      for (const source of voice.sources)
        try {
          source.stop(now + 0.5);
        } catch {
          /* already ended */
        }
  }
}
