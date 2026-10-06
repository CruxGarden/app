import { create } from 'zustand';

/**
 * The small dialogs the shell itself owns — Keyboard Shortcuts, Report a
 * Problem, About, Open-source notices — opened from the application menu, the
 * command palette and Settings alike. Rendered by components/layout/ShellDialogs.
 */
export type ShellDialog = 'shortcuts' | 'report-problem' | 'about' | 'notices';

export const useShellDialogs = create<{ open: ShellDialog | null; close: () => void }>((set) => ({
  open: null,
  close: () => set({ open: null }),
}));

export function openShellDialog(dialog: ShellDialog) {
  useShellDialogs.setState({ open: dialog });
}
