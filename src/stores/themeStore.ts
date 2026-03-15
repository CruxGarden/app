import { create } from 'zustand';
import { applyMoodPalette } from '@/lib/moods';
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

// Apply mood palette immediately to prevent flash
if (typeof document !== 'undefined') {
  applyToDOM(initialResolved);
  applyMoodPalette({});
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initial,
  resolved: initialResolved,
  setMode: (mode) => {
    const resolved = resolveMode(mode);
    setSetting('cruxgarden:theme', mode);
    applyToDOM(resolved);
    applyMoodPalette({});
    set({ mode, resolved });
  },
}));
