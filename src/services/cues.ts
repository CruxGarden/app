/**
 * Sound Cues — short sounds the Mood plays on app events, and ducking while
 * the AI works. Only audible once the user has opted into sound (pressed play
 * once); never before. The cue *kind* per event is the Mood's choice.
 */
import { getSetting, setSetting } from './settings';
import { SettingsKey } from '@/lib/constants';

export type CueEvent = 'message' | 'toolDone' | 'snapshot' | 'published' | 'error';
export type CueKind = 'chime' | 'tick' | 'bloom' | 'thud';
export type SoundCues = Record<CueEvent, CueKind | null>;

export const CUE_EVENTS: { id: CueEvent; label: string; hint: string }[] = [
  { id: 'message', label: 'Reply arrives', hint: 'the AI finished a message' },
  { id: 'toolDone', label: 'Tool finished', hint: 'a file was written, read, or changed' },
  { id: 'snapshot', label: 'Snapshot taken', hint: 'a version was captured' },
  { id: 'published', label: 'Shared', hint: 'the crux went live' },
  { id: 'error', label: 'Something failed', hint: 'a publish or tool error' },
];
export const CUE_KINDS: { id: CueKind; label: string }[] = [
  { id: 'tick', label: 'Tick' },
  { id: 'chime', label: 'Chime' },
  { id: 'bloom', label: 'Bloom' },
  { id: 'thud', label: 'Thud' },
];

export const DEFAULT_CUES: SoundCues = {
  message: null,
  toolDone: 'tick',
  snapshot: 'bloom',
  published: 'chime',
  error: 'thud',
};

export function getCues(): SoundCues {
  const raw = getSetting(SettingsKey.ResonanceCues) as string | null;
  if (!raw) return { ...DEFAULT_CUES };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<CueEvent, unknown>>;
    const out = { ...DEFAULT_CUES };
    for (const ev of Object.keys(out) as CueEvent[]) {
      const v = parsed[ev];
      if (v === null) out[ev] = null;
      else if (CUE_KINDS.some((k) => k.id === v)) out[ev] = v as CueKind;
    }
    return out;
  } catch {
    return { ...DEFAULT_CUES };
  }
}

export function saveCues(cues: SoundCues): void {
  setSetting(SettingsKey.ResonanceCues, JSON.stringify(cues));
}

let cuesPlayed = 0;
export function cuesPlayedCount(): number {
  return cuesPlayed;
}

/** Play the Mood's cue for an event (no-op before the user opted into sound). */
export async function playCue(event: CueEvent): Promise<void> {
  if (typeof window === 'undefined') return;
  const { useAudioStore } = await import('@/stores/audioStore');
  const s = useAudioStore.getState();
  if (!s.optIn) return;
  const kind = getCues()[event];
  if (!kind) return;
  cuesPlayed += 1;
  await s.cue(kind);
}

/** Dip the soundscape while the AI works; release afterwards. */
export async function duckAudio(on: boolean): Promise<void> {
  if (typeof window === 'undefined') return;
  const { useAudioStore } = await import('@/stores/audioStore');
  const s = useAudioStore.getState();
  if (!s.playing && !on) return;
  if (!s.optIn) return;
  await s.duck(on);
}
