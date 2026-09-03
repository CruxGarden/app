/**
 * The active Mood's palette = the chosen preset for the current mode, with the
 * user's custom theme tokens layered on top. This is the one place that
 * composition lives; themeStore, the boot path, and the Mood Builder all call
 * applyActiveMood() instead of applying presets by hand.
 */
import { applyMoodPalette, GARDEN_DARK, type MoodPalette } from './index';
import { type MoodPresetDef } from './presets';
import { allPresets } from './user-presets';
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
  const preset = allPresets().find((p) => p.id === activePresetId(section));
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

// ── Preview layer ─────────────────────────────────────────────────────────
// Transient tokens on top of the saved theme — the AI uses this to signal
// state ("building…", "done") without touching what the user chose. Never
// persisted; gone on reload.
let preview: ThemeOverrides = {};
const previewListeners = new Set<() => void>();

export function getThemePreview(): ThemeOverrides {
  return { ...preview };
}

/** Replace (or, with merge, extend) the preview layer and re-apply. */
export function setThemePreview(
  tokens: ThemeOverrides | null,
  opts: { merge?: boolean } = {},
): void {
  const next: ThemeOverrides = opts.merge ? { ...preview } : {};
  for (const [k, v] of Object.entries(tokens ?? {})) {
    if (k in GARDEN_DARK && typeof v === 'string' && v.trim()) next[k] = v;
  }
  preview = next;
  applyActiveMood();
  previewListeners.forEach((fn) => fn());
}

export function onThemePreviewChange(fn: () => void): () => void {
  previewListeners.add(fn);
  return () => previewListeners.delete(fn);
}

/** Preset + saved overrides + preview layer, ready for applyMoodPalette. */
export function composeMoodPalette(section: MoodSection = resolvedSection()): Partial<MoodPalette> {
  return { ...(activePreset(section)?.overrides ?? {}), ...getThemeOverrides(section), ...preview };
}

/** Apply the active Mood for a mode to the document (no-op without a DOM). */
export function applyActiveMood(section: MoodSection = resolvedSection()): void {
  if (typeof document === 'undefined') return;
  applyMoodPalette(composeMoodPalette(section));
}
