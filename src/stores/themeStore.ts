import { create } from 'zustand';

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

const stored = (typeof localStorage !== 'undefined' ? localStorage.getItem('cruxgarden:theme') : null) as Mode | null;
const initial = stored ?? 'dark';
const initialResolved = resolveMode(initial);

// Apply immediately to prevent flash
if (typeof document !== 'undefined') {
  applyToDOM(initialResolved);
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: initial,
  resolved: initialResolved,
  setMode: (mode) => {
    const resolved = resolveMode(mode);
    localStorage.setItem('cruxgarden:theme', mode);
    applyToDOM(resolved);
    set({ mode, resolved });
  },
}));
