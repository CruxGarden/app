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

export interface DialogChoice {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export interface ChoiceOptions {
  title?: string;
  message: string;
  /** Rendered left to right; the last is the default focus. */
  choices: DialogChoice[];
  /** An opt-in the person can tick alongside the choice. */
  checkbox?: { label: string; checked?: boolean };
}

export interface ChoiceResult {
  /** The chosen id; null on Escape / close / teardown. */
  choice: string | null;
  checked: boolean;
}

interface DialogRequest extends ConfirmOptions {
  id: number;
  /** Alerts have no cancel; confirm resolves true; choice carries its own buttons. */
  kind: 'confirm' | 'alert' | 'choice';
  choices?: DialogChoice[];
  checkbox?: ChoiceOptions['checkbox'];
  resolve: (ok: boolean, result?: ChoiceResult) => void;
}

interface DialogState {
  queue: DialogRequest[];
  /** The request currently shown (head of the queue), or null. */
  current: () => DialogRequest | null;
  enqueue: (req: Omit<DialogRequest, 'id'>) => void;
  settle: (id: number, ok: boolean, result?: ChoiceResult) => void;
  reset: () => void;
}

let nextId = 1;

export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  current: () => get().queue[0] ?? null,
  enqueue: (req) => set((s) => ({ queue: [...s.queue, { ...req, id: nextId++ }] })),
  settle: (id, ok, result) => {
    const req = get().queue.find((r) => r.id === id);
    if (!req) return;
    set((s) => ({ queue: s.queue.filter((r) => r.id !== id) }));
    req.resolve(ok, result);
  },
  reset: () => {
    const { queue } = get();
    set({ queue: [] });
    for (const r of queue) r.resolve(false, { choice: null, checked: false });
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

/**
 * Offer several ways forward (and an optional checkbox). Resolves with the
 * chosen id, or null when dismissed.
 */
export function choiceDialog(options: ChoiceOptions): Promise<ChoiceResult> {
  return new Promise((resolve) => {
    useDialogStore.getState().enqueue({
      title: options.title,
      message: options.message,
      choices: options.choices,
      checkbox: options.checkbox,
      kind: 'choice',
      resolve: (_ok, result) => resolve(result ?? { choice: null, checked: false }),
    });
  });
}
