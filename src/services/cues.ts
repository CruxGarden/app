/**
 * Sound Cues — short sounds the Mood plays on app events, and ducking while
 * the AI works. Only audible once the user has opted into sound (pressed play
 * once); never before. The cue *kind* per event is the Mood's choice.
 */
import { getSetting, setSetting } from './settings';
import { SettingsKey } from '@/lib/constants';
import { CUE_PRESETS, cuePreset, type CueGroup } from '@/audio/cue-presets';
import { parseCuePatch, type CuePatch } from '@/audio/cue-synth';

export type CueEvent = 'message' | 'toolDone' | 'snapshot' | 'published' | 'error';
/**
 * What plays on an event: a preset id from the bank, or a patch of your own
 * (SYNTH-CUES-PLAN). The five original ids are presets, so every Mood saved
 * before the synth still reads.
 */
export type CueKind = string | CuePatch;
export type SoundCues = Record<CueEvent, CueKind | null>;

export const CUE_EVENTS: { id: CueEvent; label: string; hint: string }[] = [
  { id: 'message', label: 'Reply arrives', hint: 'the AI finished a message' },
  { id: 'toolDone', label: 'Tool finished', hint: 'a file was written, read, or changed' },
  { id: 'snapshot', label: 'Snapshot taken', hint: 'a version was captured' },
  { id: 'published', label: 'Shared', hint: 'the crux went live' },
  { id: 'error', label: 'Something failed', hint: 'a publish or tool error' },
];
/** The preset bank as the picker lists it. */
export const CUE_KINDS: { id: string; label: string; group: CueGroup }[] = CUE_PRESETS.map((p) => ({
  id: p.id,
  label: p.name,
  group: p.group,
}));

/** A saved choice to something the engine can play; null when it is nothing playable. */
export function resolveCue(kind: CueKind | null | undefined): CuePatch | null {
  if (!kind) return null;
  if (typeof kind === 'string') return cuePreset(kind)?.patch ?? null;
  try {
    return parseCuePatch(kind);
  } catch {
    return null;
  }
}

/** Validate a choice from a package or a setting; strings must name a preset, objects must parse. */
export function parseCueChoice(value: unknown): CueKind | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return cuePreset(value) ? value : null;
  try {
    return parseCuePatch(value);
  } catch {
    return null;
  }
}

/** A choice's display name. */
export function cueLabel(kind: CueKind | null | undefined): string {
  if (!kind) return 'Silent';
  if (typeof kind === 'string') return cuePreset(kind)?.name ?? kind;
  return kind.name;
}

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
      if (!Object.hasOwn(parsed, ev)) continue;
      out[ev] = parseCueChoice(parsed[ev]);
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
let duckOwners = 0;
export async function duckAudio(on: boolean): Promise<void> {
  if (typeof window === 'undefined') return;
  duckOwners = Math.max(0, duckOwners + (on ? 1 : -1));
  const { useAudioStore } = await import('@/stores/audioStore');
  const s = useAudioStore.getState();
  if (!s.optIn) return;
  await s.duck(duckOwners > 0);
}
