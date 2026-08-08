import { create } from 'zustand';
import { applyMoodPalette } from '@/lib/moods';
import { MOOD_PRESETS } from '@/lib/moods/presets';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { ThemeMode } from '@/lib/types';

interface ThemeState {
  mode: ThemeMode;
  activeMode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

function resolveMode(mode: ThemeMode): ThemeMode {
  if (mode !== ThemeMode.Auto) return mode as unknown as ThemeMode;
  if (typeof window === 'undefined') return ThemeMode.Dark;
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? ThemeMode.Light
    : ThemeMode.Dark;
}

function applyToDOM(activeMode: ThemeMode) {
  const html = document.documentElement;
  html.classList.remove(ThemeMode.Dark, ThemeMode.Light);
  html.classList.add(activeMode);
}

const initial = (getSetting(SettingsKey.Theme) as ThemeMode | null) ?? ThemeMode.Dark;
const initialResolved = resolveMode(initial);

// Apply saved mood preset immediately to prevent flash
if (typeof document !== 'undefined') {
  applyToDOM(initialResolved);
  const moodKey =
    initialResolved === ThemeMode.Light ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark;
  const expectedSection = initialResolved === ThemeMode.Light ? 'Light' : 'Dark';
  const savedId = getSetting(moodKey) as string | null;
  let preset = savedId ? MOOD_PRESETS.find((p) => p.id === savedId) : null;
  if (preset && preset.section !== expectedSection) preset = null;
  applyMoodPalette(preset?.overrides || {});
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initial,
  activeMode: initialResolved,
  setMode: (mode) => {
    const activeMode = resolveMode(mode);
    setSetting(SettingsKey.Theme, mode);
    applyToDOM(activeMode);
    const key =
      activeMode === ThemeMode.Light ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark;
    const section = activeMode === ThemeMode.Light ? 'Light' : 'Dark';
    const id = getSetting(key) as string | null;
    let preset = id ? MOOD_PRESETS.find((p) => p.id === id) : null;
    if (preset && preset.section !== section) preset = null;
    applyMoodPalette(preset?.overrides || {});
    set({ mode, activeMode });
  },
}));
