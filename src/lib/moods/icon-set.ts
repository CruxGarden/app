/**
 * Icon Set — the `iconSet` choice token (ADR 0014). CSS cannot swap SVG paths,
 * so the theme applier mirrors the token onto `<html data-icon-set>` and fires
 * one event; every icon in components/ui/icons re-renders its path for the set.
 * Pure DOM, no React — the hook lives with the icon module.
 */

export const ICON_SETS = ['line', 'filled', 'pixel'] as const;
export type IconSet = (typeof ICON_SETS)[number];

export const DEFAULT_ICON_SET: IconSet = 'line';
export const ICON_SET_EVENT = 'crux:icon-set';

export function isIconSet(v: unknown): v is IconSet {
  return typeof v === 'string' && (ICON_SETS as readonly string[]).includes(v);
}

/** The set the document is currently drawing (default without a DOM). */
export function currentIconSet(): IconSet {
  if (typeof document === 'undefined') return DEFAULT_ICON_SET;
  const v = document.documentElement.dataset.iconSet;
  return isIconSet(v) ? v : DEFAULT_ICON_SET;
}

/**
 * Set the document's icon set. Unknown values fall back to the default; a
 * change dispatches ICON_SET_EVENT on `document` so mounted icons re-render.
 */
export function applyIconSet(value: string | null | undefined): IconSet {
  const set = isIconSet(value) ? value : DEFAULT_ICON_SET;
  if (typeof document === 'undefined') return set;
  const el = document.documentElement;
  if (el.dataset.iconSet !== set) {
    el.dataset.iconSet = set;
    document.dispatchEvent(new Event(ICON_SET_EVENT));
  }
  return set;
}
