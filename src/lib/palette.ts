/**
 * Dynamic palette system.
 *
 * Every UI property is a CSS custom property (--bg, --text, --accent, etc.).
 * A Palette object maps these keys to values. The AI can send a partial
 * palette via the `set_palette` tool to customize the workspace in real-time.
 * Palettes are stored per-crux in `crux.meta.settings.palette`.
 *
 * Beyond colors, the palette controls glass blur, mesh background, border
 * radius, and font stacks — giving the AI full visual control.
 *
 * To apply a palette, call `applyPalette()` which sets CSS custom properties
 * on <html>. To restore defaults, call `resetPalette()`.
 */

export interface Palette {
  // Colors
  bg: string;
  surface: string;
  surfaceSolid: string;
  panel: string;
  text: string;
  textMuted: string;
  border: string;
  accent: string;
  accentMuted: string;
  error: string;
  errorMuted: string;
  mesh1: string;
  mesh2: string;
  mesh3: string;
  mesh4: string;

  // Glass
  glassBlur: string;
  panelBlur: string;

  // Mesh
  meshOpacity: string;
  meshBlur: string;
  meshSpeed: string;
  meshScale: string;

  // Shape
  radius: string;
  radiusSm: string;

  // Font
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
}

export const DARK_PALETTE: Palette = {
  bg: '#0b0d0c',
  surface: 'rgba(18, 21, 19, 0.7)',
  surfaceSolid: '#131514',
  panel: 'rgba(20, 24, 22, 0.6)',
  text: '#e2e4e3',
  textMuted: '#8b908d',
  border: 'rgba(82, 96, 86, 0.18)',
  accent: '#7db3a3',
  accentMuted: 'rgba(125, 179, 163, 0.12)',
  error: '#e63946',
  errorMuted: 'rgba(230, 57, 70, 0.15)',
  mesh1: '#0e1a16',
  mesh2: '#172220',
  mesh3: '#0d1512',
  mesh4: '#131c18',
  glassBlur: '12px',
  panelBlur: '16px',
  meshOpacity: '0.6',
  meshBlur: '120px',
  meshSpeed: '1',
  meshScale: '1',
  radius: '0.5rem',
  radiusSm: '0.375rem',
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
};

export const LIGHT_PALETTE: Palette = {
  bg: '#eaeceb',
  surface: 'rgba(214, 218, 215, 0.7)',
  surfaceSolid: '#d6d9d7',
  panel: 'rgba(220, 224, 221, 0.6)',
  text: '#1c211d',
  textMuted: '#616864',
  border: 'rgba(82, 96, 86, 0.2)',
  accent: '#4a8074',
  accentMuted: 'rgba(74, 128, 116, 0.12)',
  error: '#c5303b',
  errorMuted: 'rgba(197, 48, 59, 0.12)',
  mesh1: '#cdd2ce',
  mesh2: '#c0c6c2',
  mesh3: '#d3d7d4',
  mesh4: '#c6ccc8',
  glassBlur: '12px',
  panelBlur: '16px',
  meshOpacity: '0.6',
  meshBlur: '120px',
  meshSpeed: '1',
  meshScale: '1',
  radius: '0.5rem',
  radiusSm: '0.375rem',
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
};

/** Map camelCase palette keys to CSS custom property names */
const KEY_TO_VAR: Record<keyof Palette, string> = {
  bg: '--bg',
  surface: '--surface',
  surfaceSolid: '--surface-solid',
  panel: '--panel',
  text: '--text',
  textMuted: '--text-muted',
  border: '--border',
  accent: '--accent',
  accentMuted: '--accent-muted',
  error: '--error',
  errorMuted: '--error-muted',
  mesh1: '--mesh-1',
  mesh2: '--mesh-2',
  mesh3: '--mesh-3',
  mesh4: '--mesh-4',
  glassBlur: '--glass-blur',
  panelBlur: '--panel-blur',
  meshOpacity: '--mesh-opacity',
  meshBlur: '--mesh-blur',
  meshSpeed: '--mesh-speed',
  meshScale: '--mesh-scale',
  radius: '--radius',
  radiusSm: '--radius-sm',
  fontDisplay: '--font-display',
  fontBody: '--font-body',
  fontMono: '--font-mono',
};

/** Apply a full or partial palette to the document */
export function applyPalette(palette: Partial<Palette>): void {
  const el = document.documentElement;
  el.classList.add('palette-transition');
  for (const [key, value] of Object.entries(palette)) {
    const cssVar = KEY_TO_VAR[key as keyof Palette];
    if (cssVar && value) {
      el.style.setProperty(cssVar, value);
    }
  }
  setTimeout(() => el.classList.remove('palette-transition'), 500);
}

/** Remove all inline palette overrides, restoring CSS-defined defaults */
export function resetPalette(): void {
  const el = document.documentElement;
  for (const cssVar of Object.values(KEY_TO_VAR)) {
    el.style.removeProperty(cssVar);
  }
}

/** Get the current resolved palette from computed styles */
export function getCurrentPalette(): Palette {
  const el = document.documentElement;
  const cs = getComputedStyle(el);
  const palette = {} as Palette;
  for (const [key, cssVar] of Object.entries(KEY_TO_VAR)) {
    palette[key as keyof Palette] = cs.getPropertyValue(cssVar).trim();
  }
  return palette;
}
