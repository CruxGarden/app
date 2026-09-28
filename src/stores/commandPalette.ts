import { create } from 'zustand';

/**
 * The one ⌘K surface (UX pass 2, 2026-09-27): go anywhere, open or close any
 * panel, wear a Mood, change a setting or run an action from the keyboard.
 * Rendered by components/layout/CommandPalette.
 */
interface CommandPaletteState {
  open: boolean;
  /** What the field starts with when it opens. */
  query: string;
  openPalette: (query?: string) => void;
  close: () => void;
}

export const useCommandPalette = create<CommandPaletteState>((set) => ({
  open: false,
  query: '',
  openPalette: (query = '') => set({ open: true, query }),
  close: () => set({ open: false }),
}));

export function openCommandPalette(query?: string) {
  useCommandPalette.getState().openPalette(query);
}
