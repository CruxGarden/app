/**
 * Sound state the UI reads: the Mood's track, whether it plays, volume, level.
 * The player (an <audio> element through WebAudio) is loaded lazily on first
 * play so it never lands in the boot bundle. Persists what the user chose.
 */
import { create } from 'zustand';
import * as persist from '@/services/sound';
import type { SoundTrack } from '@/services/sound';
import { cuesPlayedCount, type CueKind } from '@/services/cues';
import { isPublicSite } from '@/lib/site';
import { parseSynthPatch, type SynthPatch } from '@/audio/synth-patch';
import { isSilent } from '@/lib/platform';

type Player = import('@/audio/track').TrackPlayer | import('@/audio/synth').SynthPlayer;
let playerPromise: Promise<Player> | null = null;
/** Outside a browser (unit tests) the store still works; the player is a no-op. */
const NOOP_PLAYER = {
  onChange: () => () => {},
  load: async () => {},
  play: async () => {},
  pause: () => {
    ++playRevision;
  },
  setVolume: () => {},
  duck: () => {},
  context: () => null,
  playing: false,
} as unknown as Player;

async function getPlayer() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return NOOP_PLAYER;
  if (!playerPromise) {
    playerPromise = (
      isPublicSite()
        ? import('@/audio/track').then((m) => m.trackPlayer)
        : import('@/audio/synth').then((m) => m.synthPlayer)
    ).then((player) => {
      player.onChange((snap) => {
        useAudioStore.setState({
          level: snap.level,
          contextState: snap.contextState,
          ducked: snap.ducked,
        });
      });
      return player;
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
  synth: SynthPatch;
  setSynth: (patch: SynthPatch) => Promise<void>;
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
let playRevision = 0;

export const useAudioStore = create<AudioState>((set, get) => ({
  track: null,
  synth: persist.getSynth(),
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
      synth: persist.getSynth(),
      enabled: persist.getEnabled(),
      volume: persist.getVolume(),
      optIn: persist.getOptIn(),
    });
    // Sound resumes on launch only if the user opted in and left it playing.
    if (persist.getOptIn() && persist.getWasPlaying()) void get().play();
  },

  play: async () => {
    const { track, volume, enabled } = get();
    if (!enabled || isSilent()) return;
    const revision = ++playRevision;
    const p = await getPlayer();
    p.setVolume(volume);
    if ('configure' in p) p.configure(get().synth);
    else {
      const url = await resolveTrackUrl(track);
      if (!url) return;
      await p.load(url);
    }
    if (revision !== playRevision) return;
    await p.play();
    if (revision !== playRevision) return;
    persist.setOptIn(true);
    persist.setWasPlaying(true);
    set({ playing: true, optIn: true });
  },

  pause: () => {
    ++playRevision;
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
    if (!isPublicSite()) return;
    if (!track) {
      if (get().playing) get().pause();
      return;
    }
    if (get().playing) {
      const url = await resolveTrackUrl(track);
      const player = await getPlayer();
      if (url && 'load' in player) await player.load(url);
    }
  },

  setSynth: async (raw) => {
    const synth = parseSynthPatch(raw);
    persist.setSynth(synth);
    set({ synth });
    const player = await getPlayer();
    if ('configure' in player) player.configure(synth);
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
        trackName: isPublicSite() ? (s.track?.name ?? null) : 'Crux Synth',
        synth: s.synth,
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
