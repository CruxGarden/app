/**
 * The screen's phosphor: amber by default, green as the other one. A
 * `data-phosphor` attribute on <html> that the stylesheet keys its palette
 * on; the choice is remembered in this browser. The head of every page
 * applies the stored value before first paint (an inline line in Base.astro);
 * this module is the one place the key and the values are named.
 */

import type { KeyValueStorage } from './local-state';

export type Phosphor = 'amber' | 'green';

export const PHOSPHOR_KEY = '5ws:phosphor';
export const PHOSPHORS: readonly Phosphor[] = ['amber', 'green'];

export function isPhosphor(v: unknown): v is Phosphor {
  return v === 'amber' || v === 'green';
}

export function loadPhosphor(storage: KeyValueStorage): Phosphor {
  try {
    const v = storage.getItem(PHOSPHOR_KEY);
    return isPhosphor(v) ? v : 'amber';
  } catch {
    return 'amber';
  }
}

export function savePhosphor(storage: KeyValueStorage, p: Phosphor): void {
  try {
    storage.setItem(PHOSPHOR_KEY, p);
  } catch {
    /* private mode: the page keeps the choice for this visit */
  }
}

export function otherPhosphor(p: Phosphor): Phosphor {
  return p === 'amber' ? 'green' : 'amber';
}

/** Set the attribute the stylesheet reads. */
export function applyPhosphor(
  root: { setAttribute(n: string, v: string): void },
  p: Phosphor,
): void {
  root.setAttribute('data-phosphor', p);
}

/** Read what the page is showing now (the head script may have set it before this module ran). */
export function currentPhosphor(root: { getAttribute(n: string): string | null }): Phosphor {
  const v = root.getAttribute('data-phosphor');
  return isPhosphor(v) ? v : 'amber';
}

// ── Sound: off by default, remembered ───────────────────────────────────────

export const SOUND_KEY = '5ws:sound';

export function loadSound(storage: KeyValueStorage): boolean {
  try {
    return storage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

export function saveSound(storage: KeyValueStorage, on: boolean): void {
  try {
    storage.setItem(SOUND_KEY, on ? 'on' : 'off');
  } catch {
    /* as above */
  }
}
