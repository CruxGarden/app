/**
 * Palette type definitions and constants.
 *
 * Every UI property is a CSS custom property (--bg, --text, --accent, etc.).
 * A Palette object maps these keys to values.
 *
 * Runtime palette overrides are disabled for now — the CSS-defined defaults
 * in globals.css are the source of truth.
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

  // Chrome
  contrast: string;
  overlay: string;
  previewBg: string;

  // Brand
  brandAi: string;

  // Pane indicator colors
  paneCollaboration: string;
  paneArtifacts: string;
  paneWorkshop: string;
  paneDetails: string;
  paneHistory: string;
  paneExport: string;
  paneSync: string;
  panePublish: string;

  // Bloom gradient
  bloomBg1: string;
  bloomBg2: string;
  bloom1: string;
  bloom2: string;
  bloom3: string;
  bloom4: string;
  bloom5: string;
  bloom6: string;

  // Bloom animation
  bloomOpacity: string;
  bloomBlur: string;
  bloomSpeed: string;

  // Background type
  backgroundType: string;

  // Starfield
  starColor: string;
  starOpacity: string;
  starSpeed: string;
  starDensity: string;

  // Flow field
  flowColor: string;
  flowSpeed: string;

  // Shape
  radius: string;
  radiusSm: string;

  // Font
  fontDisplay: string;
  fontBody: string;
  fontMono: string;

  // Syntax highlighting
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxFunction: string;
  syntaxPunctuation: string;
}

export const DARK_PALETTE: Palette = {
  bg: '#0b0d0c',
  surface: 'rgba(18, 21, 19, 0.93)',
  surfaceSolid: '#131514',
  panel: 'rgba(20, 24, 22, 0.95)',
  text: '#e2e4e3',
  textMuted: '#8b908d',
  border: 'rgba(82, 96, 86, 0.18)',
  accent: '#7db3a3',
  accentMuted: 'rgba(125, 179, 163, 0.12)',
  error: '#e63946',
  errorMuted: 'rgba(230, 57, 70, 0.15)',
  contrast: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.5)',
  previewBg: 'rgba(0, 0, 0, 0.2)',
  brandAi: '#D97757',
  paneCollaboration: '#d47080',
  paneArtifacts: '#d4944c',
  paneWorkshop: '#c8a84c',
  paneDetails: '#5cb87a',
  paneHistory: '#4cb8b0',
  paneExport: '#5b9ed4',
  paneSync: '#8c7cc8',
  panePublish: '#c87ca8',
  bloomBg1: '#0a1810',
  bloomBg2: '#060d08',
  bloom1: '#1a5a99',
  bloom2: '#8a4a99',
  bloom3: '#4a8a99',
  bloom4: '#994a3a',
  bloom5: '#7a7a3a',
  bloom6: '#3a8a7a',
  bloomOpacity: '1',
  bloomBlur: '60px',
  bloomSpeed: '1',
  backgroundType: 'bloom',
  starColor: '#e0e7ff',
  starOpacity: '0.8',
  starSpeed: '1',
  starDensity: '150',
  flowColor: '#7db3a3',
  flowSpeed: '1',
  radius: '0.5rem',
  radiusSm: '0.375rem',
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  syntaxComment: '#6a7a6e',
  syntaxKeyword: '#7db3a3',
  syntaxString: '#a8d4c4',
  syntaxNumber: '#c4956a',
  syntaxType: '#9bc4b6',
  syntaxFunction: '#b8d8ca',
  syntaxPunctuation: '#8b908d',
};

export const LIGHT_PALETTE: Palette = {
  bg: '#eaeceb',
  surface: 'rgba(214, 218, 215, 0.93)',
  surfaceSolid: '#d6d9d7',
  panel: 'rgba(220, 224, 221, 0.95)',
  text: '#1c211d',
  textMuted: '#616864',
  border: 'rgba(82, 96, 86, 0.2)',
  accent: '#4a8074',
  accentMuted: 'rgba(74, 128, 116, 0.12)',
  error: '#c5303b',
  errorMuted: 'rgba(197, 48, 59, 0.12)',
  contrast: '#ffffff',
  overlay: 'rgba(0, 0, 0, 0.4)',
  previewBg: 'rgba(0, 0, 0, 0.06)',
  brandAi: '#D97757',
  paneCollaboration: '#c45868',
  paneArtifacts: '#c47c3c',
  paneWorkshop: '#b8903c',
  paneDetails: '#4a9e68',
  paneHistory: '#3a9e98',
  paneExport: '#4a86bc',
  paneSync: '#7a6ab8',
  panePublish: '#b06a98',
  bloomBg1: '#0a1810',
  bloomBg2: '#060d08',
  bloom1: '#1a5a99',
  bloom2: '#8a4a99',
  bloom3: '#4a8a99',
  bloom4: '#994a3a',
  bloom5: '#7a7a3a',
  bloom6: '#3a8a7a',
  bloomOpacity: '1',
  bloomBlur: '60px',
  bloomSpeed: '1',
  backgroundType: 'bloom',
  starColor: '#c8d0e0',
  starOpacity: '0.6',
  starSpeed: '1',
  starDensity: '120',
  flowColor: '#3a7064',
  flowSpeed: '1',
  radius: '0.5rem',
  radiusSm: '0.375rem',
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  syntaxComment: '#616864',
  syntaxKeyword: '#4a8074',
  syntaxString: '#3a7060',
  syntaxNumber: '#9a6840',
  syntaxType: '#507a6e',
  syntaxFunction: '#3a7060',
  syntaxPunctuation: '#616864',
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
  contrast: '--contrast',
  overlay: '--overlay',
  previewBg: '--preview-bg',
  brandAi: '--brand-ai',
  paneCollaboration: '--pane-collaboration',
  paneArtifacts: '--pane-artifacts',
  paneWorkshop: '--pane-workshop',
  paneDetails: '--pane-details',
  paneHistory: '--pane-history',
  paneExport: '--pane-export',
  paneSync: '--pane-sync',
  panePublish: '--pane-publish',
  bloomBg1: '--bloom-bg1',
  bloomBg2: '--bloom-bg2',
  bloom1: '--bloom-1',
  bloom2: '--bloom-2',
  bloom3: '--bloom-3',
  bloom4: '--bloom-4',
  bloom5: '--bloom-5',
  bloom6: '--bloom-6',
  bloomOpacity: '--bloom-opacity',
  bloomBlur: '--bloom-blur',
  bloomSpeed: '--bloom-speed',
  backgroundType: '--background-type',
  starColor: '--star-color',
  starOpacity: '--star-opacity',
  starSpeed: '--star-speed',
  starDensity: '--star-density',
  flowColor: '--flow-color',
  flowSpeed: '--flow-speed',
  radius: '--radius',
  radiusSm: '--radius-sm',
  fontDisplay: '--font-display',
  fontBody: '--font-body',
  fontMono: '--font-mono',
  syntaxComment: '--syntax-comment',
  syntaxKeyword: '--syntax-keyword',
  syntaxString: '--syntax-string',
  syntaxNumber: '--syntax-number',
  syntaxType: '--syntax-type',
  syntaxFunction: '--syntax-function',
  syntaxPunctuation: '--syntax-punctuation',
};

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
