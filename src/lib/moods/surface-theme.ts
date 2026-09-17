/**
 * The surface theme — the person's switch over any Mood (ADR 0043), now with
 * three settings rather than two:
 *
 *   Plasma  every primary surface is drawn by one shared WebGL material
 *           (@cruxgarden/plasma-ui): panels fuse on contact, refract what is
 *           behind them, and float over a procedural field. styles/plasma.css
 *           plus PlasmaStage and usePlasmaSurface.
 *   Glass   translucent, blurred CSS glass with a sheen (styles/glass.css).
 *   Custom  the Mood as designed: its own surfaceStyle token decides, and the
 *           Mood Builder can change every pane colour and glass token.
 *
 * The resolved style lands on <html data-surface-style>. The Mood keeps its
 * accent, text, fonts and shapes in every case; the theme takes its surfaces.
 */
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting } from '@/services/settings';

export type SurfaceStyle = 'solid' | 'glass' | 'plasma';
export type SurfaceTheme = 'plasma' | 'glass' | 'custom';

export const SURFACE_THEME_LABELS: Record<SurfaceTheme, string> = {
  plasma: 'Plasma',
  glass: 'Glass',
  custom: 'Custom',
};

export const SURFACE_THEMES: SurfaceTheme[] = ['plasma', 'glass', 'custom'];

/**
 * Read a stored value, including the ones written before this was a
 * three-way switch: `on` meant force glass, `off` and `system` both end up
 * at Custom, where the Mood's own token decides.
 */
export function normalizeSurfaceTheme(raw: string | null | undefined): SurfaceTheme {
  if (raw === 'plasma' || raw === 'glass' || raw === 'custom') return raw;
  if (raw === 'on') return 'glass';
  return 'custom';
}

export function resolveSurfaceStyle(
  theme: string | null | undefined,
  moodDefault: string | null | undefined,
): SurfaceStyle {
  if (theme === 'plasma') return 'plasma';
  if (theme === 'glass' || theme === 'on') return 'glass';
  // `off` predates the three-way switch and meant "no glass, whatever the
  // Mood says". The picker no longer offers it, but someone who chose it is
  // still owed a solid surface - mapping it onto Custom would hand a glass
  // Mood straight back to them. Choosing any theme replaces it.
  if (theme === 'off') return 'solid';
  if (moodDefault === 'plasma') return 'plasma';
  return moodDefault === 'glass' ? 'glass' : 'solid';
}

export function surfaceTheme(): SurfaceTheme {
  return normalizeSurfaceTheme(getSetting(SettingsKey.LiquidGlass));
}

export function setSurfaceTheme(value: SurfaceTheme): void {
  setSetting(SettingsKey.LiquidGlass, value);
  applySurfaceTheme();
  document.dispatchEvent(new Event('palette-change'));
}

/** Resolve and apply the surface style to <html>; called after every Mood apply. */
export function applySurfaceTheme(root: HTMLElement = document.documentElement): SurfaceStyle {
  const moodDefault =
    root.style.getPropertyValue('--surface-style').trim() ||
    (typeof getComputedStyle === 'function'
      ? getComputedStyle(root).getPropertyValue('--surface-style').trim()
      : '');
  const style = resolveSurfaceStyle(surfaceTheme(), moodDefault);
  root.dataset.surfaceStyle = style;
  return style;
}
