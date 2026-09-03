/**
 * Resonance state the UI reads: what's playing, the mixes, volume, level.
 * The engine (Tone.js) is loaded lazily on first play so it never lands in
 * the boot bundle. Persists what the user chose.
 */
import { create } from 'zustand';
import type { Mix } from '@/audio/schema';
import * as persist from '@/services/resonance';

type EngineModule = typeof import('@/audio/engine');
let enginePromise: Promise<EngineModule['engine']> | null = null;
async function getEngine() {
  if (!enginePromise) {
    enginePromise = import('@/audio/engine').then((m) => {
      m.engine.onChange((snap) => {
        useAudioStore.setState({
          level: snap.level,
          contextState: snap.contextState,
          ducked: snap.ducked,
        });
      });
      return m.engine;
    });
  }
  return enginePromise;
}

export interface AudioState {
  mixes: Mix[];
  activeMixId: string;
  playing: boolean;
  /** 0..1 */
  volume: number;
  level: number;
  contextState: 'suspended' | 'running' | 'closed' | 'none';
  ducked: boolean;
  optIn: boolean;
  /** Load persisted state; called once from the Dock. */
  init: () => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  selectMix: (id: string) => Promise<void>;
  setVolume: (v: number) => void;
  /** Replace or add a Mix (edits from the Mixer / the AI). */
  upsertMix: (mix: Mix) => Promise<void>;
  deleteMix: (id: string) => void;
  duck: (on: boolean) => Promise<void>;
  cue: (kind: 'chime' | 'tick' | 'bloom' | 'thud') => Promise<void>;
}

let initialised = false;

export const useAudioStore = create<AudioState>((set, get) => ({
  mixes: [],
  activeMixId: '',
  playing: false,
  volume: 0.7,
  level: 0,
  contextState: 'none',
  ducked: false,
  optIn: false,

  init: () => {
    if (initialised) return;
    initialised = true;
    const mixes = persist.getMixes();
    const saved = persist.getActiveMixId();
    const activeMixId = mixes.some((m) => m.id === saved) ? saved : mixes[0]!.id;
    set({ mixes, activeMixId, volume: persist.getVolume(), optIn: persist.getOptIn() });
    // Sound resumes on launch only if the user opted in and left it playing.
    if (persist.getOptIn() && persist.getWasPlaying()) void get().play();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        void getEngine().then((e) => (document.hidden ? e.suspend() : e.resume()));
      });
    }
  },

  play: async () => {
    const { mixes, activeMixId, volume } = get();
    const mix = mixes.find((m) => m.id === activeMixId) ?? mixes[0];
    if (!mix) return;
    const e = await getEngine();
    e.setVolume(volume);
    await e.play(mix);
    persist.setOptIn(true);
    persist.setWasPlaying(true);
    set({ playing: true, optIn: true });
  },

  pause: () => {
    void getEngine().then((e) => e.pause());
    persist.setWasPlaying(false);
    set({ playing: false });
  },

  toggle: async () => (get().playing ? get().pause() : get().play()),

  next: async () => {
    const { mixes, activeMixId } = get();
    const i = mixes.findIndex((m) => m.id === activeMixId);
    const nextMix = mixes[(i + 1) % mixes.length];
    if (nextMix) await get().selectMix(nextMix.id);
  },

  selectMix: async (id) => {
    const mix = get().mixes.find((m) => m.id === id);
    if (!mix) return;
    persist.setActiveMixId(id);
    set({ activeMixId: id });
    if (get().playing) await (await getEngine()).play(mix);
  },

  setVolume: (v) => {
    const vol = Math.min(1, Math.max(0, v));
    persist.setVolume(vol);
    set({ volume: vol });
    void getEngine().then((e) => e.setVolume(vol));
  },

  upsertMix: async (mix) => {
    const mixes = get().mixes.some((m) => m.id === mix.id)
      ? get().mixes.map((m) => (m.id === mix.id ? mix : m))
      : [...get().mixes, mix];
    persist.saveMixes(mixes);
    set({ mixes });
    if (get().activeMixId === mix.id) (await getEngine()).update(mix);
  },

  deleteMix: (id) => {
    const mixes = get().mixes.filter((m) => m.id !== id);
    if (mixes.length === 0) return;
    persist.saveMixes(mixes);
    set({ mixes });
    if (get().activeMixId === id) void get().selectMix(mixes[0]!.id);
  },

  duck: async (on) => (await getEngine()).duck(on),
  cue: async (kind) => (await getEngine()).cue(kind),
}));

// Test/diagnostic hook: read-only view of the audio state.
if (typeof window !== 'undefined') {
  (window as unknown as { __cruxAudio?: unknown }).__cruxAudio = {
    state: () => {
      const s = useAudioStore.getState();
      return {
        playing: s.playing,
        activeMixId: s.activeMixId,
        mixName: s.mixes.find((m) => m.id === s.activeMixId)?.name ?? null,
        layerCount: s.mixes.find((m) => m.id === s.activeMixId)?.layers.length ?? 0,
        volume: s.volume,
        contextState: s.contextState,
        optIn: s.optIn,
        ducked: s.ducked,
        level: s.level,
      };
    },
  };
}
