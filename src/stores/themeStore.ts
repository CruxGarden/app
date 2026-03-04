import { create } from 'zustand';
import { applyTint, type TintName } from '@/lib/palette';

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

const TINT_STORAGE_KEY = 'cruxgarden:tint';

const stored = (
  typeof localStorage !== 'undefined' ? localStorage.getItem('cruxgarden:theme') : null
) as Mode | null;
const initial = stored ?? 'dark';
const initialResolved = resolveMode(initial);

const storedTint = (
  typeof localStorage !== 'undefined' ? localStorage.getItem(TINT_STORAGE_KEY) : null
) as TintName | null;
const initialTint: TintName = storedTint ?? 'gray';

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
    localStorage.setItem('cruxgarden:theme', mode);
    applyToDOM(resolved);
    applyTint(get().tint, resolved);
    set({ mode, resolved });
  },
  setTint: (tint) => {
    localStorage.setItem(TINT_STORAGE_KEY, tint);
    applyTint(tint, get().resolved);
    set({ tint });
  },
}));
