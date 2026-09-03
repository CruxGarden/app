/** Persistence for the Resonance Sound Mixer — mixes, the active one, volume, opt-in, Dock. */
import { getSetting, setSetting } from './settings';
import { SettingsKey } from '@/lib/constants';
import { validateMix, type Mix } from '@/audio/schema';
import { DEFAULT_MIXES } from '@/audio/default-mixes';
import { validatePlaylist, type Playlist } from '@/audio/playlist';

export function getMixes(): Mix[] {
  const raw = getSetting(SettingsKey.ResonanceMixes) as string | null;
  if (!raw) return DEFAULT_MIXES.map((m) => ({ ...m }));
  try {
    const parsed = JSON.parse(raw) as unknown;
    const mixes = Array.isArray(parsed) ? (parsed.map(validateMix).filter(Boolean) as Mix[]) : [];
    return mixes.length ? mixes : DEFAULT_MIXES.map((m) => ({ ...m }));
  } catch {
    return DEFAULT_MIXES.map((m) => ({ ...m }));
  }
}

export function saveMixes(mixes: Mix[]): void {
  setSetting(SettingsKey.ResonanceMixes, JSON.stringify(mixes));
}

export function getActiveMixId(): string {
  return (getSetting(SettingsKey.ResonanceActiveMix) as string) || DEFAULT_MIXES[0]!.id;
}
export function setActiveMixId(id: string): void {
  setSetting(SettingsKey.ResonanceActiveMix, id);
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

export function getPlaylist(knownMixIds: string[]): Playlist {
  const raw = getSetting(SettingsKey.ResonancePlaylist) as string | null;
  if (!raw) return validatePlaylist(undefined, knownMixIds);
  try {
    return validatePlaylist(JSON.parse(raw), knownMixIds);
  } catch {
    return validatePlaylist(undefined, knownMixIds);
  }
}
export function savePlaylist(pl: Playlist): void {
  setSetting(SettingsKey.ResonancePlaylist, JSON.stringify(pl));
}
