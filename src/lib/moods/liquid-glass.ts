/**
 * Liquid glass — a person's switch over any Mood (ADR 0043). `on` turns
 * every surface the Mood paints solid into translucent, blurred glass with
 * moving light, a sheen and refraction (styles/glass.css, the light layer in
 * MoodTextureLayers); `off` keeps the Mood as designed; `system` (the
 * default) follows the Mood's own `surfaceStyle` token. The resolved style
 * lands on <html data-surface-style>. The Mood keeps its accent, text, fonts,
 * shapes and pane colours; glass takes its surfaces.
 */
import { SettingsKey } from '@/lib/constants';
import { getSetting, setSetting } from '@/services/settings';

export type SurfaceStyle = 'solid' | 'glass';
export type LiquidGlassSetting = 'system' | 'on' | 'off';

export const LIQUID_GLASS_LABELS: Record<LiquidGlassSetting, string> = {
  system: 'System',
  on: 'On',
  off: 'Off',
};

export function resolveSurfaceStyle(
  setting: string | null | undefined,
  moodDefault: string | null | undefined,
): SurfaceStyle {
  if (setting === 'on') return 'glass';
  if (setting === 'off') return 'solid';
  return moodDefault === 'glass' ? 'glass' : 'solid';
}

export function liquidGlassSetting(): LiquidGlassSetting {
  const raw = getSetting(SettingsKey.LiquidGlass);
  return raw === 'on' || raw === 'off' ? raw : 'system';
}

export function setLiquidGlassSetting(value: LiquidGlassSetting): void {
  setSetting(SettingsKey.LiquidGlass, value);
  applyLiquidGlass();
  document.dispatchEvent(new Event('palette-change'));
}

/** Resolve and apply the surface style to <html>; called after every Mood apply. */
export function applyLiquidGlass(root: HTMLElement = document.documentElement): SurfaceStyle {
  const moodDefault =
    root.style.getPropertyValue('--surface-style').trim() ||
    (typeof getComputedStyle === 'function'
      ? getComputedStyle(root).getPropertyValue('--surface-style').trim()
      : '');
  const style = resolveSurfaceStyle(liquidGlassSetting(), moodDefault);
  root.dataset.surfaceStyle = style;
  return style;
}
