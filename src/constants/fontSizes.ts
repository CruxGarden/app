export type FontType = 'sans-serif' | 'serif' | 'monospace';

export interface FontSizeConfig {
  heading: number;
  body: number;
  control: number;
}

export const FONT_SIZES: Record<FontType, FontSizeConfig> & { lineHeight: number } = {
  'sans-serif': {
    heading: 19,
    body: 16,
    control: 16,
  },
  serif: {
    heading: 19,
    body: 16,
    control: 16,
  },
  monospace: {
    heading: 19,
    body: 14,
    control: 14,
  },
  lineHeight: 26,
};

export function getFontSizes(fontType: FontType): FontSizeConfig {
  return FONT_SIZES[fontType];
}

export function getLineHeight(): number {
  return FONT_SIZES.lineHeight;
}
