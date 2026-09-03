/**
 * Presets the user made. A saved preset is a complete look — the base preset's
 * overrides merged with the user's edits — so it stands alone: it can be
 * exported as one file and imported into another garden.
 */
import { GARDEN_DARK } from './garden-dark';
import { MOOD_PRESETS, type MoodPresetDef } from './presets';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

export interface UserPreset extends MoodPresetDef {
  /** Who made it (username), for sharing. */
  author?: string;
  created: string;
}

/** The shareable file shape. */
export interface MoodThemeFile {
  format: 'crux-mood-theme';
  version: 1;
  name: string;
  section: 'Dark' | 'Light';
  author?: string;
  created?: string;
  overrides: Record<string, string>;
}

const listeners = new Set<() => void>();

export function onUserPresetsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function clean(overrides: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(overrides ?? {})) {
    if (k in GARDEN_DARK && typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

export function getUserPresets(): UserPreset[] {
  const raw = getSetting(SettingsKey.MoodUserPresets) as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (p): p is UserPreset =>
          !!p && typeof p === 'object' && typeof (p as UserPreset).id === 'string',
      )
      .map((p) => ({ ...p, overrides: clean(p.overrides) }));
  } catch {
    return [];
  }
}

function write(presets: UserPreset[]) {
  setSetting(SettingsKey.MoodUserPresets, presets.length ? JSON.stringify(presets) : '');
  listeners.forEach((fn) => fn());
}

export function slugifyPresetName(name: string): string {
  return (
    'user-' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
  );
}

/** Save (or replace by id) a user preset. */
export function saveUserPreset(input: {
  name: string;
  section: 'Dark' | 'Light';
  overrides: Record<string, string>;
  author?: string;
  id?: string;
}): UserPreset {
  const name = input.name.trim() || 'My theme';
  const id = input.id ?? slugifyPresetName(name);
  const preset: UserPreset = {
    id,
    name,
    section: input.section,
    overrides: clean(input.overrides),
    author: input.author,
    created: new Date().toISOString(),
  };
  const rest = getUserPresets().filter((p) => p.id !== id);
  write([...rest, preset]);
  return preset;
}

export function deleteUserPreset(id: string): void {
  write(getUserPresets().filter((p) => p.id !== id));
}

/** Built-in + user presets, user ones last. */
export function allPresets(): MoodPresetDef[] {
  return [...MOOD_PRESETS, ...getUserPresets()];
}

export function toThemeFile(preset: {
  name: string;
  section: 'Dark' | 'Light';
  overrides: Record<string, string>;
  author?: string;
}): MoodThemeFile {
  return {
    format: 'crux-mood-theme',
    version: 1,
    name: preset.name,
    section: preset.section,
    author: preset.author,
    created: new Date().toISOString(),
    overrides: preset.overrides,
  };
}

/** Accepts a theme file, a bare overrides map, or the older {overrides} export. */
export function parseThemeFile(text: string): {
  name?: string;
  section?: 'Dark' | 'Light';
  author?: string;
  overrides: Record<string, string>;
} | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.format === 'crux-mood-theme' || 'overrides' in obj) {
      const section =
        obj.section === 'Light' ? 'Light' : obj.section === 'Dark' ? 'Dark' : undefined;
      return {
        name: typeof obj.name === 'string' ? obj.name : undefined,
        section,
        author: typeof obj.author === 'string' ? obj.author : undefined,
        overrides: clean((obj.overrides as Record<string, unknown>) ?? {}),
      };
    }
    return { overrides: clean(obj) };
  } catch {
    return null;
  }
}
