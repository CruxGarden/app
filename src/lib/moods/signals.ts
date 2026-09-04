/**
 * Reactive theme signals (ADR 0014): three live numbers, 0..1, written as CSS
 * variables on <html> so a Mood can let the interface react to what is
 * happening —
 *
 *   --signal-audio   the Resonance level (what the Mood Bar's bars show)
 *   --signal-typing  1 on a keystroke in the composer or editor, decaying to 0
 *   --signal-agent   1 while a collaborator turn is streaming
 *
 * CSS multiplies each by a binding token (reactAccentAudio, reactBackgroundTyping,
 * reactPaneAgent; default 0) — see motion.css and bloom.css — so a Mood that
 * says nothing does not move. Writes are rAF-throttled and smoothed, and the
 * loop stops when every signal is at rest. `startSignals()` is called once
 * from the app root; the pure parts (decay, smoothing, clamping) are tested.
 */
import { useAudioStore } from '@/stores/audioStore';
import { useCruxStore } from '@/stores/cruxStore';

export const TYPING_DECAY_MS = 1500;
/** Per-frame approach rate toward a target (1 = jump, 0 = never) at 60fps. */
export const SMOOTHING = 0.25;
const EPSILON = 0.004;

export function clamp01(n: number): number {
  return n <= 0 || Number.isNaN(n) ? 0 : n >= 1 ? 1 : n;
}

/** Typing signal `sinceMs` after the last keystroke: 1 → 0 over the decay window, easing out. */
export function typingLevel(sinceMs: number, decayMs = TYPING_DECAY_MS): number {
  if (sinceMs <= 0) return 1;
  if (sinceMs >= decayMs) return 0;
  const t = 1 - sinceMs / decayMs;
  return t * t;
}

/** The engine meter → a 0..1 level with the same curve the Mood Bar bars use. */
export function audioLevel(meter: number, playing: boolean): number {
  if (!playing || !(meter > 0)) return 0;
  return clamp01(Math.sqrt(meter) * 1.6);
}

/** One smoothing step from `current` toward `target`; snaps when within epsilon. */
export function approach(current: number, target: number, rate = SMOOTHING): number {
  const next = current + (target - current) * rate;
  return Math.abs(target - next) < EPSILON ? target : next;
}

export interface SignalValues {
  audio: number;
  typing: number;
  agent: number;
}

/** Is a keystroke in this element "writing" (composer textarea, Monaco's input, contenteditable)? */
export function isWritingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  return target.isContentEditable;
}

/** Ignore modifier chords and pure navigation; count characters, Enter, Backspace, Delete, Space. */
export function isWritingKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  return e.key.length === 1 || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete';
}

/**
 * The signal state machine, DOM-free: feed it inputs, ask it for values at a
 * time. `settled` is true when nothing will change without new input.
 */
export class SignalState {
  private lastKeyAt = -Infinity;
  private audioTarget = 0;
  private agentTarget = 0;
  readonly values: SignalValues = { audio: 0, typing: 0, agent: 0 };

  keystroke(now: number): void {
    this.lastKeyAt = now;
  }
  setAudio(meter: number, playing: boolean): void {
    this.audioTarget = audioLevel(meter, playing);
  }
  setAgent(streaming: boolean): void {
    this.agentTarget = streaming ? 1 : 0;
  }

  /** Advance to `now`; returns which values changed (for selective CSS writes). */
  tick(now: number): Partial<SignalValues> {
    const changed: Partial<SignalValues> = {};
    const typing = typingLevel(now - this.lastKeyAt);
    if (typing !== this.values.typing) changed.typing = this.values.typing = typing;
    const audio = approach(this.values.audio, this.audioTarget);
    if (audio !== this.values.audio) changed.audio = this.values.audio = audio;
    const agent = approach(this.values.agent, this.agentTarget);
    if (agent !== this.values.agent) changed.agent = this.values.agent = agent;
    return changed;
  }

  get settled(): boolean {
    return (
      this.values.typing === 0 &&
      this.values.audio === this.audioTarget &&
      this.values.agent === this.agentTarget
    );
  }
}

const VARS: Record<keyof SignalValues, string> = {
  audio: '--signal-audio',
  typing: '--signal-typing',
  agent: '--signal-agent',
};

let stop: (() => void) | null = null;

/**
 * Subscribe to the audio store, the crux store and keystrokes; write the
 * signals to <html>. Idempotent; returns the stop function.
 */
export function startSignals(): () => void {
  if (stop) return stop;
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  const state = new SignalState();
  let frame = 0;

  const write = (changed: Partial<SignalValues>) => {
    for (const k of Object.keys(changed) as (keyof SignalValues)[]) {
      root.style.setProperty(VARS[k], changed[k]!.toFixed(3));
    }
  };
  const loop = () => {
    frame = 0;
    write(state.tick(performance.now()));
    if (!state.settled) frame = requestAnimationFrame(loop);
  };
  const wake = () => {
    if (!frame) frame = requestAnimationFrame(loop);
  };

  const onKey = (e: KeyboardEvent) => {
    if (!isWritingKey(e) || !isWritingTarget(e.target)) return;
    state.keystroke(performance.now());
    wake();
  };
  document.addEventListener('keydown', onKey, true);

  const unAudio = useAudioStore.subscribe((s, prev) => {
    if (s.level === prev.level && s.playing === prev.playing) return;
    state.setAudio(s.level, s.playing);
    wake();
  });
  const unCrux = useCruxStore.subscribe((s, prev) => {
    if (s.isStreaming === prev.isStreaming) return;
    state.setAgent(s.isStreaming);
    wake();
  });
  state.setAudio(useAudioStore.getState().level, useAudioStore.getState().playing);
  state.setAgent(useCruxStore.getState().isStreaming);
  wake();

  stop = () => {
    document.removeEventListener('keydown', onKey, true);
    unAudio();
    unCrux();
    if (frame) cancelAnimationFrame(frame);
    for (const v of Object.values(VARS)) root.style.removeProperty(v);
    stop = null;
  };
  return stop;
}
