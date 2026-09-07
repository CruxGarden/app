/**
 * Sound Cues — short synthesized blips the Mood plays on app events. Plain
 * WebAudio: an oscillator, an envelope, done. They share the track player's
 * context when it has one, so ducking and cues never fight over devices.
 */
import type { CueKind } from '@/services/cues';

const NOTES: Record<string, number> = {
  D2: 73.42,
  D4: 293.66,
  A4: 440,
  D5: 587.33,
  E5: 659.25,
  B5: 987.77,
  A6: 1760,
};

let own: AudioContext | null = null;

function blip(
  ctx: AudioContext,
  freq: number,
  at: number,
  dur: number,
  type: OscillatorType,
  peak: number,
  release: number,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + release);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + dur + release + 0.05);
}

export async function playCueSound(kind: CueKind, ctx?: AudioContext | null): Promise<void> {
  if (typeof AudioContext === 'undefined') return;
  const c = ctx ?? (own ??= new AudioContext());
  if (c.state === 'suspended') await c.resume().catch(() => {});
  const now = c.currentTime;
  const peak = 0.18;
  if (kind === 'chime') {
    blip(c, NOTES.E5!, now, 0.1, 'triangle', peak, 0.35);
    blip(c, NOTES.B5!, now + 0.12, 0.2, 'triangle', peak, 0.4);
  } else if (kind === 'tick') {
    blip(c, NOTES.A6!, now, 0.03, 'triangle', peak * 0.8, 0.12);
  } else if (kind === 'bloom') {
    blip(c, NOTES.D4!, now, 0.5, 'triangle', peak, 1.2);
    blip(c, NOTES.A4!, now + 0.15, 0.5, 'triangle', peak, 1.2);
    blip(c, NOTES.D5!, now + 0.3, 0.9, 'triangle', peak, 1.2);
  } else {
    blip(c, NOTES.D2!, now, 0.2, 'sine', peak * 1.4, 0.4);
  }
}
