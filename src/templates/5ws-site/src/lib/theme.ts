/**
 * Light or dark, defaulting to the system: a `data-theme` attribute on <html>
 * (`light` | `dark`, what the stylesheet keys on) and `data-theme-choice`
 * (`system` | `light` | `dark`, what the visitor picked). The choice is
 * remembered in this browser under `5ws:theme`; the head of every page applies
 * it before first paint (an inline script in Base.astro that mirrors
 * `resolveTheme`), and this module is the one place the key, the cycle and the
 * labels are named. The toggle cycles system → light → dark → system.
 */

import type { KeyValueStorage } from './local-state';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_KEY = '5ws:theme';
export const THEME_CYCLE: readonly ThemeChoice[] = ['system', 'light', 'dark'];
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'system' || v === 'light' || v === 'dark';
}

export function loadTheme(storage: KeyValueStorage): ThemeChoice {
  try {
    const v = storage.getItem(THEME_KEY);
    return isThemeChoice(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

export function saveTheme(storage: KeyValueStorage, choice: ThemeChoice): void {
  try {
    storage.setItem(THEME_KEY, choice);
  } catch {
    /* private mode: the page keeps the choice for this visit */
  }
}

/** system → light → dark → system */
export function nextTheme(choice: ThemeChoice): ThemeChoice {
  const i = THEME_CYCLE.indexOf(choice);
  return THEME_CYCLE[(i + 1) % THEME_CYCLE.length]!;
}

/** What `system` means right now. */
export function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  if (choice === 'system') return systemDark ? 'dark' : 'light';
  return choice;
}

/** Set the two attributes the stylesheet and the toggle read. Returns what is showing. */
export function applyTheme(
  root: { setAttribute(n: string, v: string): void },
  choice: ThemeChoice,
  systemDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(choice, systemDark);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-choice', choice);
  return resolved;
}

/** What the page picked (the head script may have set it before this module ran). */
export function currentThemeChoice(root: { getAttribute(n: string): string | null }): ThemeChoice {
  const v = root.getAttribute('data-theme-choice');
  return isThemeChoice(v) ? v : 'system';
}

export function themeLabel(choice: ThemeChoice): string {
  return choice === 'system' ? 'System' : choice === 'light' ? 'Light' : 'Dark';
}

/** The toggle's accessible name: what it is on, and what one press does. */
export function themeToggleLabel(choice: ThemeChoice): string {
  return `Theme: ${themeLabel(choice)} — switch to ${themeLabel(nextTheme(choice)).toLowerCase()}`;
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
