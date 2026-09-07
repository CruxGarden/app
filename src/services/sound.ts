/**
 * Persistence for the Mood's sound: the track, volume, on/off, the opt-in
 * that lets sound resume on launch, and the Mood Bar's collapsed state.
 */
import { getSetting, setSetting } from './settings';
import { SettingsKey } from '@/lib/constants';

/**
 * One track. A file the user brought (Blob Store `fingerprint`) or a file the
 * app ships (`url`, a bundled Mood). Bundled tracks are ingested into the
 * Blob Store on apply where there is one, so a saved Mood carries them.
 */
export interface SoundTrack {
  fingerprint?: string;
  url?: string;
  name: string;
  type: string;
}

export function validateTrack(raw: unknown): SoundTrack | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const fingerprint =
    typeof t.fingerprint === 'string' && t.fingerprint ? t.fingerprint : undefined;
  const url = typeof t.url === 'string' && t.url ? t.url : undefined;
  if (!fingerprint && !url) return null;
  return {
    ...(fingerprint ? { fingerprint } : {}),
    ...(url ? { url } : {}),
    name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 120) : 'Track',
    type: typeof t.type === 'string' && t.type ? t.type : 'audio/*',
  };
}

export function getTrack(): SoundTrack | null {
  const raw = getSetting(SettingsKey.SoundTrack) as string | null;
  if (!raw) return null;
  try {
    return validateTrack(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function setTrack(track: SoundTrack | null): void {
  setSetting(SettingsKey.SoundTrack, track ? JSON.stringify(track) : '');
}

/** Sound on for this Mood (default on; the user still has to press play once). */
export function getEnabled(): boolean {
  const v = getSetting(SettingsKey.SoundEnabled) as string | null;
  return v === null || v === undefined || v === '' ? true : v === 'true';
}
export function setEnabled(v: boolean): void {
  setSetting(SettingsKey.SoundEnabled, v ? 'true' : 'false');
}

/** 0..1 */
export function getVolume(): number {
  const v = parseFloat((getSetting(SettingsKey.ResonanceVolume) as string) ?? '');
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7;
}
export function setVolume(v: number): void {
  setSetting(SettingsKey.ResonanceVolume, String(Math.min(1, Math.max(0, v))));
}

/** The user pressed play once in this garden — sound may resume on launch. */
export function getOptIn(): boolean {
  return getSetting(SettingsKey.ResonanceOptIn) === 'true';
}
export function setOptIn(v: boolean): void {
  setSetting(SettingsKey.ResonanceOptIn, v ? 'true' : '');
}
export function getWasPlaying(): boolean {
  return getSetting(SettingsKey.ResonancePlaying) === 'true';
}
export function setWasPlaying(v: boolean): void {
  setSetting(SettingsKey.ResonancePlaying, v ? 'true' : '');
}

export interface DockState {
  x: number;
  y: number;
  collapsed: boolean;
}
export function getDockState(): DockState | null {
  const raw = getSetting(SettingsKey.MoodDockState) as string | null;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<DockState>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    return { x: p.x, y: p.y, collapsed: p.collapsed === true };
  } catch {
    return null;
  }
}
export function setDockState(s: DockState): void {
  setSetting(SettingsKey.MoodDockState, JSON.stringify(s));
}
