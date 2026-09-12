/**
 * Sound state the UI reads: the Mood's track, whether it plays, volume, level.
 * The player (an <audio> element through WebAudio) is loaded lazily on first
 * play so it never lands in the boot bundle. Persists what the user chose.
 */
import { create } from 'zustand';
import * as persist from '@/services/sound';
import type { SoundTrack } from '@/services/sound';
import { cuesPlayedCount, type CueKind } from '@/services/cues';
import { isSilent } from '@/lib/platform';

type PlayerModule = typeof import('@/audio/track');
let playerPromise: Promise<PlayerModule['trackPlayer']> | null = null;
/** Outside a browser (unit tests) the store still works; the player is a no-op. */
const NOOP_PLAYER = {
  onChange: () => () => {},
  load: async () => {},
  play: async () => {},
  pause: () => {},
  setVolume: () => {},
  duck: () => {},
  context: () => null,
  playing: false,
} as unknown as PlayerModule['trackPlayer'];

async function getPlayer() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return NOOP_PLAYER;
  if (!playerPromise) {
    playerPromise = import('@/audio/track').then((m) => {
      m.trackPlayer.onChange((snap) => {
        useAudioStore.setState({
          level: snap.level,
          contextState: snap.contextState,
          ducked: snap.ducked,
        });
      });
      return m.trackPlayer;
    });
  }
  return playerPromise;
}

/** Where the bytes are: a Blob Store object URL, or the shipped file's URL. */
async function resolveTrackUrl(track: SoundTrack | null): Promise<string | null> {
  if (!track) return null;
  if (
    track.fingerprint &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  ) {
    try {
      const { blobObjectUrl } = await import('@/services/blobs');
      return await blobObjectUrl(track.fingerprint, track.type);
    } catch {
      /* fall through to the url, if any */
    }
  }
  return track.url ?? null;
}

export interface AudioState {
  /** The Mood's track; null when the Mood has no sound */
  track: SoundTrack | null;
  /** Sound switched on for this Mood */
  enabled: boolean;
  playing: boolean;
  /** 0..1 */
  volume: number;
  /** 0..1 level for the bars */
  level: number;
  contextState: 'suspended' | 'running' | 'closed' | 'none';
  ducked: boolean;
  /** the user pressed play once — sound may resume on launch, cues may sound */
  optIn: boolean;

  init: () => void;
  play: () => Promise<void>;
  pause: () => void;
  toggle: () => Promise<void>;
  setVolume: (v: number) => void;
  setEnabled: (on: boolean) => void;
  /** Change the track (null removes it); keeps playing when it was. */
  setTrack: (track: SoundTrack | null) => Promise<void>;
  duck: (on: boolean) => Promise<void>;
  cue: (kind: CueKind) => Promise<void>;
}

let initialised = false;

export const useAudioStore = create<AudioState>((set, get) => ({
  track: null,
  enabled: true,
  playing: false,
  volume: 0.7,
  level: 0,
  contextState: 'none',
  ducked: false,
  optIn: false,

  init: () => {
    if (initialised) return;
    initialised = true;
    set({
      track: persist.getTrack(),
      enabled: persist.getEnabled(),
      volume: persist.getVolume(),
      optIn: persist.getOptIn(),
    });
    // Sound resumes on launch only if the user opted in and left it playing.
    if (persist.getOptIn() && persist.getWasPlaying()) void get().play();
  },

  play: async () => {
    const { track, volume, enabled } = get();
    if (!track || !enabled || isSilent()) return;
    const url = await resolveTrackUrl(track);
    if (!url) return;
    const p = await getPlayer();
    p.setVolume(volume);
    await p.load(url);
    await p.play();
    persist.setOptIn(true);
    persist.setWasPlaying(true);
    set({ playing: true, optIn: true });
  },

  pause: () => {
    void getPlayer().then((p) => p.pause());
    persist.setWasPlaying(false);
    set({ playing: false });
  },

  toggle: async () => (get().playing ? get().pause() : get().play()),

  setVolume: (v) => {
    const vol = Math.min(1, Math.max(0, v));
    persist.setVolume(vol);
    set({ volume: vol });
    void getPlayer().then((p) => p.setVolume(vol));
  },

  setEnabled: (on) => {
    persist.setEnabled(on);
    set({ enabled: on });
    if (!on && get().playing) get().pause();
  },

  setTrack: async (track) => {
    persist.setTrack(track);
    set({ track });
    if (!track) {
      if (get().playing) get().pause();
      return;
    }
    if (get().playing) {
      const url = await resolveTrackUrl(track);
      if (url) await (await getPlayer()).load(url);
    }
  },

  duck: async (on) => (await getPlayer()).duck(on),
  cue: async (kind) => {
    if (isSilent()) return;
    const { playCueSound } = await import('@/audio/cues');
    const p = await getPlayer();
    await playCueSound(kind, p.context());
  },
}));

// Test/diagnostic hook: read-only view of the audio state.
if (typeof window !== 'undefined') {
  (window as unknown as { __cruxAudio?: unknown }).__cruxAudio = {
    state: () => {
      const s = useAudioStore.getState();
      return {
        playing: s.playing,
        trackName: s.track?.name ?? null,
        enabled: s.enabled,
        volume: s.volume,
        contextState: s.contextState,
        optIn: s.optIn,
        ducked: s.ducked,
        level: s.level,
        cuesPlayed: cuesPlayedCount(),
      };
    },
  };
}
