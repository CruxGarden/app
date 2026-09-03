import { create } from 'zustand';
import { applyActiveMood } from '@/lib/moods/active';
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

// Apply the saved Mood immediately to prevent flash
if (typeof document !== 'undefined') {
  applyToDOM(initialResolved);
  applyActiveMood(initialResolved === ThemeMode.Light ? 'Light' : 'Dark');
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initial,
  activeMode: initialResolved,
  setMode: (mode) => {
    const activeMode = resolveMode(mode);
    setSetting(SettingsKey.Theme, mode);
    applyToDOM(activeMode);
    applyActiveMood(activeMode === ThemeMode.Light ? 'Light' : 'Dark');
    set({ mode, activeMode });
  },
}));
