import { create } from 'zustand';
import { applyTint, type TintName } from '@/lib/palette';
import { getSetting, setSetting } from '@/services/settings';

type Mode = 'dark' | 'light' | 'auto';

interface ThemeState {
  mode: Mode;
  resolved: 'dark' | 'light';
  tint: TintName;
  setMode: (mode: Mode) => void;
  setTint: (tint: TintName) => void;
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
const initialTint: TintName = (getSetting('cruxgarden:tint') as TintName | null) ?? 'gray';

// Apply immediately to prevent flash
if (typeof document !== 'undefined') {
  applyToDOM(initialResolved);
  applyTint(initialTint, initialResolved);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initial,
  resolved: initialResolved,
  tint: initialTint,
  setMode: (mode) => {
    const resolved = resolveMode(mode);
    setSetting('cruxgarden:theme', mode);
    applyToDOM(resolved);
    applyTint(get().tint, resolved);
    set({ mode, resolved });
  },
  setTint: (tint) => {
    setSetting('cruxgarden:tint', tint);
    applyTint(tint, get().resolved);
    set({ tint });
  },
}));
