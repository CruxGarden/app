import { create } from 'zustand';

/**
 * App-modal confirm/alert dialogs, promise-based, callable from ANYWHERE —
 * components, stores, services — via `confirmDialog()` / `alertDialog()`.
 *
 * Replaces window.confirm/alert, which block the renderer, look like the OS
 * rather than the app, steal focus in Electron, and cannot be driven by
 * Playwright. `<DialogHost />` (mounted once in Shell) renders the request.
 *
 * Requests queue: a second confirm while one is open waits its turn rather
 * than stacking. Teardown (`dialogStore.getState().reset()`) resolves every
 * waiter with `false` so nothing awaits forever.
 */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive. */
  danger?: boolean;
}

interface DialogRequest extends ConfirmOptions {
  id: number;
  /** Alerts have no cancel; confirm resolves true. */
  kind: 'confirm' | 'alert';
  resolve: (ok: boolean) => void;
}

interface DialogState {
  queue: DialogRequest[];
  /** The request currently shown (head of the queue), or null. */
  current: () => DialogRequest | null;
  enqueue: (req: Omit<DialogRequest, 'id'>) => void;
  settle: (id: number, ok: boolean) => void;
  reset: () => void;
}

let nextId = 1;

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  current: () => get().queue[0] ?? null,
  enqueue: (req) => set((s) => ({ queue: [...s.queue, { ...req, id: nextId++ }] })),
  settle: (id, ok) => {
    const req = get().queue.find((r) => r.id === id);
    if (!req) return;
    set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
    req.resolve(ok);
  },
  reset: () => {
    const { queue } = get();
    set({ queue: [] });
    for (const r of queue) r.resolve(false);
  },
}));

/** Ask the user a yes/no question. Resolves false on cancel, Escape, or teardown. */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  const opts = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => {
    useDialogStore.getState().enqueue({ ...opts, kind: 'confirm', resolve });
  });
}

/** Tell the user something they must acknowledge. Resolves when dismissed. */
export function alertDialog(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    useDialogStore.getState().enqueue({
      message,
      title,
      kind: 'alert',
      confirmLabel: 'OK',
      resolve: () => resolve(),
    });
  });
}
