import { create } from 'zustand';
import { applyMoodPalette } from '@/lib/moods';
import { MOOD_PRESETS } from '@/lib/moods/presets';
import { getSetting, setSetting } from '@/services/settings';

type Mode = 'dark' | 'light' | 'auto';

interface ThemeState {
  mode: Mode;
  resolved: 'dark' | 'light';
  setMode: (mode: Mode) => void;
}

function resolveMode(mode: Mode): 'dark' | 'light' {
  if (mode !== 'auto') return mode;
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyToDOM(resolved: 'dark' | 'light') {
  const html = document.documentElement;
  html.classList.remove('dark', 'light');
  html.classList.add(resolved);
}

const initial = (getSetting('cruxgarden:theme') as Mode | null) ?? 'dark';
const initialResolved = resolveMode(initial);

// Apply saved mood preset immediately to prevent flash
if (typeof document !== 'undefined') {
  applyToDOM(initialResolved);
  const moodKey = initialResolved === 'light' ? 'cruxgarden:moodPresetLight' : 'cruxgarden:moodPresetDark';
  const expectedSection = initialResolved === 'light' ? 'Light' : 'Dark';
  const savedId = getSetting(moodKey) as string | null;
  let preset = savedId ? MOOD_PRESETS.find((p) => p.id === savedId) : null;
  // If saved mood is wrong section (e.g. light mood saved as dark), ignore it
  if (preset && preset.section !== expectedSection) preset = null;
  applyMoodPalette(preset?.overrides || {});
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initial,
  resolved: initialResolved,
  setMode: (mode) => {
    const resolved = resolveMode(mode);
    setSetting('cruxgarden:theme', mode);
    applyToDOM(resolved);
    // Apply the mood preset for the new mode
    const key = resolved === 'light' ? 'cruxgarden:moodPresetLight' : 'cruxgarden:moodPresetDark';
    const section = resolved === 'light' ? 'Light' : 'Dark';
    const id = getSetting(key) as string | null;
    let preset = id ? MOOD_PRESETS.find((p) => p.id === id) : null;
    if (preset && preset.section !== section) preset = null;
    applyMoodPalette(preset?.overrides || {});
    set({ mode, resolved });
  },
}));
