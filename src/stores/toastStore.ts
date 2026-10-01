import { create } from 'zustand';

/**
 * Brief notes about something that just happened, with at most one way to
 * take it back (UX pass, 2026-09-27: a reversible action says what it did and
 * offers Undo instead of asking first). Rendered by components/ui/Toaster.
 */
export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void | Promise<void> };
  tone?: 'default' | 'error';
  /** ms before it leaves on its own; paused while hovered, focused or running its action. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  show: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let next = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (toast) => {
    const id = next++;
    // The newest three stay; an older one gives way rather than stacking up.
    set((s) => ({ toasts: [...s.toasts, { duration: 6000, ...toast, id }].slice(-3) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Say what happened, optionally with one way back. */
export function toast(
  message: string,
  options: Omit<Toast, 'id' | 'message' | 'duration'> & { duration?: number } = {},
) {
  return useToastStore.getState().show({ message, ...options });
}
