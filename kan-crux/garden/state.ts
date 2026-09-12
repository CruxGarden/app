import {
  captureRecords,
  restoreRecords,
  onModelChange,
  attachmentBusy,
  assertSavedOperations,
} from './model';
import { setNavigationGuard } from './navigation';
interface Session {
  initial: Record<string, unknown> | null;
  changed: () => void;
  flush: () => Promise<void>;
  failed: (error: Error) => void;
  connect: (api: {
    capture: () => Record<string, unknown>;
    busy: () => boolean;
    beforeSave: (explicit: boolean) => Promise<void>;
    command: (value: unknown) => Promise<unknown>;
  }) => void;
}
let session: Session | undefined;
const preferences = new Map<string, string>();
let modalOpen = false;
export const setModalOpen = (value: boolean) => {
  modalOpen = value;
};
export const embedded = window.parent !== window;
export function installState(value: Session) {
  session = value;
  restoreRecords(value.initial);
  const state = value.initial?.state as
    | { route?: string; preferences?: Record<string, string> }
    | undefined;
  for (const [key, value] of Object.entries(state?.preferences ?? {})) preferences.set(key, value);
  const storage = {
    get length() {
      return preferences.size;
    },
    key: (index: number) => [...preferences.keys()][index] ?? null,
    getItem: (key: string) => preferences.get(String(key)) ?? null,
    setItem(key: string, value: string) {
      key = String(key);
      value = String(value);
      if (preferences.get(key) !== value) {
        preferences.set(key, value);
        session?.changed();
      }
    },
    removeItem(key: string) {
      if (preferences.delete(String(key))) session?.changed();
    },
    clear() {
      if (preferences.size) {
        preferences.clear();
        session?.changed();
      }
    },
  };
  const proxy = new Proxy(storage, {
    get(target, key) {
      return typeof key === 'string' && !(key in target)
        ? preferences.get(key)
        : Reflect.get(target, key);
    },
    set(target, key, value) {
      if (typeof key === 'string' && !(key in target)) {
        target.setItem(key, String(value));
        return true;
      }
      return false;
    },
    has(target, key) {
      return Reflect.has(target, key) || (typeof key === 'string' && preferences.has(key));
    },
    deleteProperty(target, key) {
      if (typeof key === 'string') {
        target.removeItem(key);
        return true;
      }
      return false;
    },
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, value: proxy });
  location.hash = state?.route || '#/boards';
  onModelChange(() => session?.changed());
  addEventListener('hashchange', () => session?.changed());
  // Native on-blur fields are committed only for explicit flush; background saving preserves focus.
  document.addEventListener('input', () => session?.changed());
  document.addEventListener('change', () => session?.changed());
  document.addEventListener('focusout', () => session?.changed());
  setNavigationGuard(() => value.flush());
}
function visible(element: Element) {
  return element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}
export async function beforeSave(explicit: boolean) {
  if (modalOpen && [...document.querySelectorAll('[role=dialog] form')].some(visible))
    throw new Error('Finish or cancel the open form before saving or leaving Kan.');
  const comment = document.querySelector('[data-garden-draft=comment] [contenteditable=true]');
  if (comment?.textContent?.trim() || comment?.querySelector('img,video,audio,iframe'))
    throw new Error('Post or clear your draft comment before saving or leaving Kan.');
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    (active.matches('input,textarea,[contenteditable=true]') ||
      active.closest('[contenteditable=true]'))
  ) {
    if (!explicit) throw new Error('Finish the current field to save its changes.');
    active.blur();
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
export function connectState(
  isMutating: () => number,
  command: (value: unknown) => Promise<unknown>,
) {
  session?.connect({
    capture() {
      assertSavedOperations();
      const records = captureRecords();
      return {
        ...records,
        state: {
          ...(records.state as object),
          route: location.hash,
          preferences: Object.fromEntries(preferences),
        },
      };
    },
    busy: () => attachmentBusy() || isMutating() > 0,
    beforeSave,
    command,
  });
}
