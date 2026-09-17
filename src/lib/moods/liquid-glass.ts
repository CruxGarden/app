/**
 * Kept for the names the rest of the app already imports. The switch is now
 * a three-way surface theme - Plasma, Glass, Custom - and lives in
 * surface-theme.ts; `system`/`on`/`off` map onto it.
 */
export {
  applySurfaceTheme as applyLiquidGlass,
  resolveSurfaceStyle,
  surfaceTheme,
  setSurfaceTheme,
  normalizeSurfaceTheme,
  SURFACE_THEMES,
  SURFACE_THEME_LABELS,
  type SurfaceStyle,
  type SurfaceTheme,
} from './surface-theme';

import { surfaceTheme, type SurfaceTheme } from './surface-theme';

/** @deprecated Use SurfaceTheme. */
export type LiquidGlassSetting = SurfaceTheme;
/** @deprecated Use SURFACE_THEME_LABELS. */
export const LIQUID_GLASS_LABELS: Record<SurfaceTheme, string> = {
  plasma: 'Plasma',
  glass: 'Glass',
  custom: 'Custom',
};
/** @deprecated Use surfaceTheme(). */
export const liquidGlassSetting = surfaceTheme;
