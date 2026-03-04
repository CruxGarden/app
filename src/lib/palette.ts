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

  // Drift
  driftColor: string;
  driftSpeed: string;
  driftDensity: string;
  driftGlow: string;
  driftBg: string;

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
  surface: '#121513',
  surfaceSolid: '#131514',
  panel: '#141816',
  text: '#e2e4e3',
  textMuted: '#8b908d',
  border: 'rgba(82, 96, 86, 0.18)',
  accent: '#7db3a3',
  accentMuted: '#1a2723',
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
  starColor: '#e0e0e0',
  starOpacity: '0.8',
  starSpeed: '1',
  starDensity: '150',
  flowColor: '#7db3a3',
  flowSpeed: '1',
  driftColor: '#d0d0d0',
  driftSpeed: '1',
  driftDensity: '400',
  driftGlow: '#808080',
  driftBg: '',
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
  bg: '#d8d8d8',
  surface: '#d2d2d2',
  surfaceSolid: '#d3d3d3',
  panel: '#d6d6d6',
  text: '#1c211d',
  textMuted: '#616864',
  border: 'rgba(82, 96, 86, 0.2)',
  accent: '#4a8074',
  accentMuted: '#c2d5ce',
  error: '#c5303b',
  errorMuted: 'rgba(197, 48, 59, 0.12)',
  contrast: '#ebebeb',
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
  driftColor: '#c8d4cc',
  driftSpeed: '1',
  driftDensity: '300',
  driftGlow: '#7aaa90',
  driftBg: '#405143',
  radius: '0.5rem',
  radiusSm: '0.375rem',
  fontDisplay: "'JetBrains Mono', monospace",
  fontBody: "'Outfit', sans-serif",
  fontMono: "'JetBrains Mono', monospace",
  syntaxComment: '#616864',
  syntaxKeyword: '#4a8074',
  syntaxString: '#8a5e30',
  syntaxNumber: '#9a6840',
  syntaxType: '#2a6a80',
  syntaxFunction: '#5a6e40',
  syntaxPunctuation: '#6a7a88',
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
  driftColor: '--drift-color',
  driftSpeed: '--drift-speed',
  driftDensity: '--drift-density',
  driftGlow: '--drift-glow',
  driftBg: '--drift-bg',
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

// ── Tint System ──────────────────────────────────────────────────────────────

export type TintName = 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'gray';

/** The palette keys that carry the accent tint */
type TintKeys = Pick<
  Palette,
  | 'bg' | 'surface' | 'surfaceSolid' | 'panel'
  | 'accent' | 'accentMuted' | 'border' | 'flowColor'
  | 'syntaxComment' | 'syntaxString' | 'syntaxType' | 'syntaxFunction'
>;

interface TintPreset {
  dark: TintKeys;
  light: TintKeys;
  /** Representative swatch color shown in UI */
  swatch: string;
}

export const TINT_PRESETS: Record<TintName, TintPreset> = {
  green: {
    dark: {
      bg: '#0b0d0c',
      surface: '#121513',
      surfaceSolid: '#131514',
      panel: '#141816',
      accent: '#7db3a3',
      accentMuted: '#1a2723',
      border: 'rgba(82, 96, 86, 0.18)',
      flowColor: '#7db3a3',
      syntaxComment: '#6a7a6e',
      syntaxString: '#a8d4c4',
      syntaxType: '#9bc4b6',
      syntaxFunction: '#b8d8ca',
    },
    light: {
      bg: '#d8d8d8',
      surface: '#d2d2d2',
      surfaceSolid: '#d3d3d3',
      panel: '#d6d6d6',
      accent: '#4a8074',
      accentMuted: '#c2d5ce',
      border: 'rgba(82, 96, 86, 0.2)',
      flowColor: '#3a7064',
      syntaxComment: '#616864',
      syntaxString: '#8a5e30',
      syntaxType: '#2a6a80',
      syntaxFunction: '#5a6e40',
    },
    swatch: '#7db3a3',
  },
  yellow: {
    dark: {
      bg: '#0d0d0b',
      surface: '#151512',
      surfaceSolid: '#151514',
      panel: '#181814',
      accent: '#b3a44d',
      accentMuted: '#23221a',
      border: 'rgba(96, 92, 78, 0.18)',
      flowColor: '#b3a44d',
      syntaxComment: '#7a786a',
      syntaxString: '#d4c88a',
      syntaxType: '#c4ba80',
      syntaxFunction: '#d8d0a0',
    },
    light: {
      bg: '#e4e3d8',
      surface: '#deddd0',
      surfaceSolid: '#dfded3',
      panel: '#e2e0d4',
      accent: '#7a6e2e',
      accentMuted: '#d5d0b8',
      border: 'rgba(96, 92, 78, 0.2)',
      flowColor: '#7a6e2e',
      syntaxComment: '#686660',
      syntaxString: '#8a5e30',
      syntaxType: '#6a6a2a',
      syntaxFunction: '#5a6e40',
    },
    swatch: '#b3a44d',
  },
  red: {
    dark: {
      bg: '#0d0b0b',
      surface: '#151212',
      surfaceSolid: '#151313',
      panel: '#181414',
      accent: '#b37070',
      accentMuted: '#231a1a',
      border: 'rgba(96, 82, 82, 0.18)',
      flowColor: '#b37070',
      syntaxComment: '#7a6a6a',
      syntaxString: '#d4a8a8',
      syntaxType: '#c49b9b',
      syntaxFunction: '#d8b8b8',
    },
    light: {
      bg: '#e4deda',
      surface: '#ded8d3',
      surfaceSolid: '#dfd9d5',
      panel: '#e2dcd6',
      accent: '#8a4444',
      accentMuted: '#d5bfbf',
      border: 'rgba(96, 82, 82, 0.2)',
      flowColor: '#8a4444',
      syntaxComment: '#686060',
      syntaxString: '#8a5e30',
      syntaxType: '#804040',
      syntaxFunction: '#6e4a40',
    },
    swatch: '#b37070',
  },
  blue: {
    dark: {
      bg: '#0b0c0d',
      surface: '#121315',
      surfaceSolid: '#131415',
      panel: '#141618',
      accent: '#7098b3',
      accentMuted: '#1a2023',
      border: 'rgba(78, 88, 96, 0.18)',
      flowColor: '#7098b3',
      syntaxComment: '#6a7280',
      syntaxString: '#a8c4d4',
      syntaxType: '#90b0c8',
      syntaxFunction: '#b0ccd8',
    },
    light: {
      bg: '#dce0e4',
      surface: '#d6dade',
      surfaceSolid: '#d7dbdf',
      panel: '#dadee2',
      accent: '#3a6a8a',
      accentMuted: '#bfccd5',
      border: 'rgba(78, 88, 96, 0.2)',
      flowColor: '#3a6a8a',
      syntaxComment: '#606468',
      syntaxString: '#8a5e30',
      syntaxType: '#2a6080',
      syntaxFunction: '#406e5a',
    },
    swatch: '#7098b3',
  },
  purple: {
    dark: {
      bg: '#0c0b0d',
      surface: '#131215',
      surfaceSolid: '#141315',
      panel: '#161418',
      accent: '#9878b3',
      accentMuted: '#201a23',
      border: 'rgba(88, 80, 96, 0.18)',
      flowColor: '#9878b3',
      syntaxComment: '#726a7a',
      syntaxString: '#c4a8d4',
      syntaxType: '#b09bc4',
      syntaxFunction: '#ccb8d8',
    },
    light: {
      bg: '#e0dce4',
      surface: '#dad6de',
      surfaceSolid: '#dbd7df',
      panel: '#dedae2',
      accent: '#6a4a8a',
      accentMuted: '#c8bfd5',
      border: 'rgba(88, 80, 96, 0.2)',
      flowColor: '#6a4a8a',
      syntaxComment: '#646068',
      syntaxString: '#8a5e30',
      syntaxType: '#604a80',
      syntaxFunction: '#5a406e',
    },
    swatch: '#9878b3',
  },
  gray: {
    dark: {
      bg: '#0c0c0c',
      surface: '#131313',
      surfaceSolid: '#141414',
      panel: '#161616',
      accent: '#7db3a3',
      accentMuted: '#1a2723',
      border: 'rgba(90, 90, 90, 0.18)',
      flowColor: '#7db3a3',
      syntaxComment: '#747474',
      syntaxString: '#bcbcbc',
      syntaxType: '#adadad',
      syntaxFunction: '#c8c8c8',
    },
    light: {
      bg: '#d8d8d8',
      surface: '#d2d2d2',
      surfaceSolid: '#d3d3d3',
      panel: '#d6d6d6',
      accent: '#4a8074',
      accentMuted: '#c2d5ce',
      border: 'rgba(90, 90, 90, 0.2)',
      flowColor: '#4a8074',
      syntaxComment: '#646464',
      syntaxString: '#6a6a6a',
      syntaxType: '#505050',
      syntaxFunction: '#585858',
    },
    swatch: '#9a9a9a',
  },
};

/** Apply a tint preset to the document */
export function applyTint(tint: TintName, mode: 'dark' | 'light') {
  const values = TINT_PRESETS[tint][mode];
  const el = document.documentElement;

  el.classList.add('palette-transition');

  for (const [key, value] of Object.entries(values)) {
    const cssVar = KEY_TO_VAR[key as keyof Palette];
    if (cssVar) el.style.setProperty(cssVar, value);
  }

  document.dispatchEvent(new Event('palette-change'));
  setTimeout(() => el.classList.remove('palette-transition'), 500);
}
