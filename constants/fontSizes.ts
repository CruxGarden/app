/**
 * Font size configurations for different font types
 *
 * Different font families have different optical sizes and need different
 * font sizes to feel balanced and readable.
 *
 * - Sans-serif: Modern, geometric fonts (IBM Plex Sans, Work Sans)
 * - Serif: Traditional fonts with serifs (IBM Plex Serif, Crimson Pro)
 * - Monospace: Fixed-width fonts (IBM Plex Mono)
 */

export type FontType = 'sans-serif' | 'serif' | 'monospace';

export interface FontSizeConfig {
  heading: number;
  body: number;
  control: number; // For buttons, links, and other UI controls
}

export const FONT_SIZES: Record<FontType, FontSizeConfig> & { lineHeight: number } = {
  'sans-serif': {
    heading: 19,
    body: 16,
    control: 16,
  },
  serif: {
    heading: 24,
    body: 20,
    control: 20,
  },
  monospace: {
    heading: 18,
    body: 14,
    control: 14,
  },
  lineHeight: 26,
};

/**
 * Get font sizes for a specific font type
 */
export function getFontSizes(fontType: FontType): FontSizeConfig {
  return FONT_SIZES[fontType];
}

/**
 * Get line height (shared across all font types)
 */
export function getLineHeight(): number {
  return FONT_SIZES.lineHeight;
}
