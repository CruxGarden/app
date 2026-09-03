/**
 * The active Mood's palette = the chosen preset for the current mode, with the
 * user's custom theme tokens layered on top. This is the one place that
 * composition lives; themeStore, the boot path, and the Mood Builder all call
 * applyActiveMood() instead of applying presets by hand.
 */
import { applyMoodPalette, GARDEN_DARK, type MoodPalette } from './index';
import { MOOD_PRESETS, type MoodPresetDef } from './presets';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

export type MoodSection = 'Dark' | 'Light';

export const DEFAULT_PRESET: Record<MoodSection, string> = { Dark: 'obsidian', Light: 'ivory' };

/** The mode the document is currently in. */
export function resolvedSection(): MoodSection {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('light')
    ? 'Light'
    : 'Dark';
}

function presetKey(section: MoodSection): string {
  return section === 'Light' ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark;
}

function overridesKey(section: MoodSection): string {
  return section === 'Light' ? SettingsKey.MoodThemeLight : SettingsKey.MoodThemeDark;
}

export function activePresetId(section: MoodSection = resolvedSection()): string {
  return (getSetting(presetKey(section)) as string) || DEFAULT_PRESET[section];
}

/** The preset for a mode; a saved id from the other mode is ignored. */
export function activePreset(section: MoodSection = resolvedSection()): MoodPresetDef | null {
  const preset = MOOD_PRESETS.find((p) => p.id === activePresetId(section));
  return preset && preset.section === section ? preset : null;
}

export type ThemeOverrides = Record<string, string>;

/** Custom token overrides for a mode. Unknown keys are dropped on read. */
export function getThemeOverrides(section: MoodSection = resolvedSection()): ThemeOverrides {
  const raw = getSetting(overridesKey(section)) as string | null;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: ThemeOverrides = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (k in GARDEN_DARK && typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function setThemeOverrides(section: MoodSection, overrides: ThemeOverrides): void {
  const clean: ThemeOverrides = {};
  for (const [k, v] of Object.entries(overrides)) {
    if (k in GARDEN_DARK && typeof v === 'string' && v.trim()) clean[k] = v;
  }
  setSetting(overridesKey(section), Object.keys(clean).length ? JSON.stringify(clean) : '');
}

/** Preset + custom overrides, ready for applyMoodPalette. */
export function composeMoodPalette(section: MoodSection = resolvedSection()): Partial<MoodPalette> {
  return { ...(activePreset(section)?.overrides ?? {}), ...getThemeOverrides(section) };
}

/** Apply the active Mood for a mode to the document. */
export function applyActiveMood(section: MoodSection = resolvedSection()): void {
  applyMoodPalette(composeMoodPalette(section));
}
