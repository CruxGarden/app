/**
 * Resonance state the UI reads: what's playing, the mixes, volume, level.
 * The engine (Tone.js) is loaded lazily on first play so it never lands in
 * the boot bundle. Persists what the user chose.
 */
import { create } from 'zustand';
import type { Mix } from '@/audio/schema';
import * as persist from '@/services/resonance';
import { nextPlaylistIndex, type Playlist } from '@/audio/playlist';
import { cuesPlayedCount } from '@/services/cues';

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
  playlist: Playlist;
  /** Index into playlist.items of what is playing (-1 when the playlist is off). */
  playlistIndex: number;
  setPlaylist: (pl: Playlist) => void;
  /** Load persisted state; called once from the Dock. */
  init: () => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  selectMix: (id: string, crossfadeSec?: number) => Promise<void>;
  setVolume: (v: number) => void;
  /** Replace or add a Mix (edits from the Mixer / the AI). */
  upsertMix: (mix: Mix) => Promise<void>;
  deleteMix: (id: string) => void;
  duck: (on: boolean) => Promise<void>;
  cue: (kind: 'chime' | 'tick' | 'bloom' | 'thud') => Promise<void>;
}

let initialised = false;
let advanceTimer: ReturnType<typeof setTimeout> | null = null;

/** (Re)arm the playlist timer for the current item; clears it when not applicable. */
function schedule(get: () => AudioState, set: (p: Partial<AudioState>) => void) {
  if (advanceTimer) clearTimeout(advanceTimer);
  advanceTimer = null;
  const { playing, playlist, playlistIndex, activeMixId } = get();
  if (!playing || !playlist.enabled || playlist.items.length === 0) return;
  let idx = playlistIndex;
  if (idx < 0 || playlist.items[idx]?.mixId !== activeMixId) {
    idx = playlist.items.findIndex((it) => it.mixId === activeMixId);
    if (idx < 0) {
      // Not on the playlist: jump onto it
      set({ playlistIndex: 0 });
      void get().selectMix(playlist.items[0]!.mixId, playlist.items[0]!.crossfadeSec);
      return;
    }
    set({ playlistIndex: idx });
  }
  const item = playlist.items[idx]!;
  advanceTimer = setTimeout(() => void get().next(), Math.max(1000, item.minutes * 60_000));
}

export const useAudioStore = create<AudioState>((set, get) => ({
  mixes: [],
  activeMixId: '',
  playing: false,
  volume: 0.7,
  level: 0,
  contextState: 'none',
  ducked: false,
  optIn: false,
  playlist: { enabled: false, shuffle: false, items: [] },
  playlistIndex: -1,

  setPlaylist: (pl) => {
    persist.savePlaylist(pl);
    set({ playlist: pl });
    schedule(get, set);
  },

  init: () => {
    if (initialised) return;
    initialised = true;
    const mixes = persist.getMixes();
    const saved = persist.getActiveMixId();
    const activeMixId = mixes.some((m) => m.id === saved) ? saved : mixes[0]!.id;
    set({
      mixes,
      activeMixId,
      volume: persist.getVolume(),
      optIn: persist.getOptIn(),
      playlist: persist.getPlaylist(mixes.map((m) => m.id)),
    });
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
    schedule(get, set);
  },

  pause: () => {
    void getEngine().then((e) => e.pause());
    persist.setWasPlaying(false);
    set({ playing: false });
    schedule(get, set);
  },

  toggle: async () => (get().playing ? get().pause() : get().play()),

  next: async () => {
    const { mixes, activeMixId, playlist, playlistIndex } = get();
    if (playlist.enabled && playlist.items.length) {
      const idx = nextPlaylistIndex(playlist, playlistIndex);
      const item = playlist.items[idx];
      if (item) {
        set({ playlistIndex: idx });
        await get().selectMix(item.mixId, playlist.items[idx]?.crossfadeSec);
        return;
      }
    }
    const i = mixes.findIndex((m) => m.id === activeMixId);
    const nextMix = mixes[(i + 1) % mixes.length];
    if (nextMix) await get().selectMix(nextMix.id);
  },

  selectMix: async (id, crossfadeSec) => {
    const mix = get().mixes.find((m) => m.id === id);
    if (!mix) return;
    persist.setActiveMixId(id);
    // Keep the playlist cursor honest when the user picks a mix by hand
    const idx = get().playlist.items.findIndex((it) => it.mixId === id);
    set({ activeMixId: id, playlistIndex: idx });
    if (get().playing) await (await getEngine()).play(mix, crossfadeSec);
    schedule(get, set);
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
    const pl = get().playlist;
    if (pl.items.some((it) => it.mixId === id)) {
      get().setPlaylist({ ...pl, items: pl.items.filter((it) => it.mixId !== id) });
    }
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
        playlistIndex: s.playlistIndex,
        playlistEnabled: s.playlist.enabled,
        cuesPlayed: cuesPlayedCount(),
      };
    },
  };
}
