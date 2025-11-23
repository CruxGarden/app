/**
 * Design Tokens
 *
 * Extracts theme metadata into a flat, easy-to-use token structure
 */

import type { ColorValue } from '@/components/ThemeBuilder';
import { FONT_SIZES, type FontType } from '@/constants/fontSizes';

export interface ShadowStyle {
  color: string;
  offsetX: number;
  offsetY: number;
  blurRadius: number;
  opacity: number;
}

export interface DesignTokens {
  colors: {
    // Palette colors
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;

    // Content colors
    background: string;
    panel: string;
    text: string;
    border: string;

    // Control colors
    buttonBackground: ColorValue;
    buttonText: string;
    buttonBorder: string;
    link: string;
    selection: string;

    // Bloom colors (may include gradients)
    bloomPrimary: ColorValue;
    bloomSecondary: ColorValue;
    bloomTertiary: ColorValue;
    bloomQuaternary: ColorValue;
    bloomBorder?: string;
  };

  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };

  typography: {
    fontFamily: {
      body: string;
      heading: string;
      mono: string;
    };
    fontSize: {
      heading: number;
      body: number;
      control: number;
    };
    lineHeight: number;
  };

  borders: {
    radius: number;
    width: number;
    style: 'solid' | 'dashed' | 'dotted';
    color: string;
  };

  button: {
    borderRadius: number;
    borderWidth: number;
    borderStyle: 'solid' | 'dashed' | 'dotted';
  };

  bloom: {
    borderWidth?: number;
  };

  link: {
    underlineStyle: 'none' | 'underline' | 'always';
  };

  shadows: {
    panel?: ShadowStyle;
    button?: ShadowStyle;
    bloom?: ShadowStyle;
  };
}

/**
 * Theme interface (matches API structure)
 */
export interface Theme {
  key: string;
  title: string;
  description?: string;
  type?: string;
  kind?: string;
  meta: {
    palette?: {
      light?: {
        primary?: string;
        secondary?: string;
        tertiary?: string;
        quaternary?: string;
      };
      dark?: {
        primary?: string;
        secondary?: string;
        tertiary?: string;
        quaternary?: string;
      };
    };
    bloom?: {
      light?: {
        primary?: { gradient?: any; solid?: string };
        secondary?: { gradient?: any; solid?: string };
        tertiary?: { gradient?: any; solid?: string };
        quaternary?: { gradient?: any; solid?: string };
        borderColor?: string;
        borderWidth?: string;
        shadowEnabled?: boolean;
        shadowColor?: string;
        shadowOffsetX?: string;
        shadowOffsetY?: string;
        shadowBlurRadius?: string;
        shadowOpacity?: string;
      };
      dark?: {
        primary?: { gradient?: any; solid?: string };
        secondary?: { gradient?: any; solid?: string };
        tertiary?: { gradient?: any; solid?: string };
        quaternary?: { gradient?: any; solid?: string };
        borderColor?: string;
        borderWidth?: string;
        shadowEnabled?: boolean;
        shadowColor?: string;
        shadowOffsetX?: string;
        shadowOffsetY?: string;
        shadowBlurRadius?: string;
        shadowOpacity?: string;
      };
    };
    content?: {
      light?: {
        backgroundColor?: string;
        panelColor?: string;
        textColor?: string;
        borderColor?: string;
        borderWidth?: string;
        borderRadius?: string;
        borderStyle?: 'solid' | 'dashed' | 'dotted';
        font?: string;
        panelShadowEnabled?: boolean;
        panelShadowColor?: string;
        panelShadowOffsetX?: string;
        panelShadowOffsetY?: string;
        panelShadowBlurRadius?: string;
        panelShadowOpacity?: string;
        selectionColor?: string;
      };
      dark?: {
        backgroundColor?: string;
        panelColor?: string;
        textColor?: string;
        borderColor?: string;
        borderWidth?: string;
        borderRadius?: string;
        borderStyle?: 'solid' | 'dashed' | 'dotted';
        font?: string;
        panelShadowEnabled?: boolean;
        panelShadowColor?: string;
        panelShadowOffsetX?: string;
        panelShadowOffsetY?: string;
        panelShadowBlurRadius?: string;
        panelShadowOpacity?: string;
        selectionColor?: string;
      };
    };
    controls?: {
      light?: {
        buttonBackground?: { gradient?: any; solid?: string };
        buttonTextColor?: string;
        buttonBorderColor?: string;
        buttonBorderWidth?: string;
        buttonBorderStyle?: 'solid' | 'dashed' | 'dotted';
        buttonBorderRadius?: string;
        buttonShadowEnabled?: boolean;
        buttonShadowColor?: string;
        buttonShadowOffsetX?: string;
        buttonShadowOffsetY?: string;
        buttonShadowBlurRadius?: string;
        buttonShadowOpacity?: string;
        linkColor?: string;
        linkUnderlineStyle?: 'none' | 'underline' | 'always';
      };
      dark?: {
        buttonBackground?: { gradient?: any; solid?: string };
        buttonTextColor?: string;
        buttonBorderColor?: string;
        buttonBorderWidth?: string;
        buttonBorderStyle?: 'solid' | 'dashed' | 'dotted';
        buttonBorderRadius?: string;
        buttonShadowEnabled?: boolean;
        buttonShadowColor?: string;
        buttonShadowOffsetX?: string;
        buttonShadowOffsetY?: string;
        buttonShadowBlurRadius?: string;
        buttonShadowOpacity?: string;
        linkColor?: string;
        linkUnderlineStyle?: 'none' | 'underline' | 'always';
      };
    };
  };
}

/**
 * Default spacing scale (in pixels)
 */
const DEFAULT_SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * Default typography based on IBM Plex Sans
 */
const DEFAULT_TYPOGRAPHY = {
  fontFamily: {
    body: 'IBMPlexSans-Regular',
    heading: 'IBMPlexSans-SemiBold',
    mono: 'IBMPlexMono-Regular',
  },
  fontSize: {
    heading: 24,
    body: 16,
    control: 16,
  },
  lineHeight: 24,
};

/**
 * Font family mapping
 */
function getFontFamily(font?: string): { body: string; heading: string; mono: string } {
  switch (font) {
    case 'serif':
      return {
        body: 'IBMPlexSerif-Regular',
        heading: 'IBMPlexSerif-SemiBold',
        mono: 'IBMPlexMono-Regular',
      };
    case 'monospace':
      return {
        body: 'IBMPlexMono-Regular',
        heading: 'IBMPlexMono-SemiBold',
        mono: 'IBMPlexMono-Regular',
      };
    case 'sans-serif':
    default:
      return {
        body: 'IBMPlexSans-Regular',
        heading: 'IBMPlexSans-SemiBold',
        mono: 'IBMPlexMono-Regular',
      };
  }
}

/**
 * Convert bloom color data to ColorValue
 * Ensures gradient IDs are unique by including mode information
 */
function toColorValue(
  bloomColor?: { gradient?: any; solid?: string },
  mode?: 'light' | 'dark',
  colorName?: string,
  defaultColor: string = '#000000'
): ColorValue {
  if (!bloomColor) {
    return { type: 'solid', value: defaultColor };
  }

  if (bloomColor.gradient) {
    const gradient = { ...bloomColor.gradient };

    // Ensure gradient has a unique ID that includes the mode
    // This prevents conflicts when both light and dark modes have gradients
    if (!gradient.id || !gradient.id.includes(`-${mode}-`)) {
      // Generate new ID with mode to ensure uniqueness
      gradient.id = `bloom-${mode}-${colorName || 'color'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    return { type: 'gradient' as const, value: gradient };
  }

  return { type: 'solid' as const, value: bloomColor.solid || defaultColor };
}

/**
 * Extract shadow style from theme metadata
 */
function extractShadow(
  enabled?: boolean,
  color?: string,
  offsetX?: string,
  offsetY?: string,
  blurRadius?: string,
  opacity?: string
): ShadowStyle | undefined {
  if (!enabled) return undefined;

  return {
    color: color || '#000000',
    offsetX: parseFloat(offsetX || '0'),
    offsetY: parseFloat(offsetY || '0'),
    blurRadius: parseFloat(blurRadius || '0'),
    opacity: parseFloat(opacity || '0'),
  };
}

/**
 * Compute design tokens from a theme and mode
 */
export function computeDesignTokens(theme: Theme | null, mode: 'light' | 'dark'): DesignTokens {
  // If no theme, return defaults
  if (!theme) {
    return getDefaultTokens();
  }

  const { meta } = theme;
  const modeData = mode === 'light' ? 'light' : 'dark';

  // Extract palette colors
  const palette = meta.palette?.[modeData];
  const primary = palette?.primary || '#2a3d2c';
  const secondary = palette?.secondary || '#426046';
  const tertiary = palette?.tertiary || '#58825e';
  const quaternary = palette?.quaternary || '#73a079';

  // Extract content colors
  const content = meta.content?.[modeData];
  const background = content?.backgroundColor || (mode === 'light' ? '#ffffff' : '#0f1214');
  const panel = content?.panelColor || (mode === 'light' ? '#f5f5f5' : '#1a1f24');
  const text = content?.textColor || (mode === 'light' ? '#000000' : '#e8eef2');
  const borderColor = content?.borderColor || (mode === 'light' ? '#cccccc' : '#333333');
  const borderWidth = parseInt(content?.borderWidth || '1');
  const borderRadius = parseInt(content?.borderRadius || '0');
  const borderStyle = content?.borderStyle || 'solid';
  const selection = content?.selectionColor || (mode === 'light' ? '#b3d9ff' : '#4a9eff');

  // Extract control colors
  const controls = meta.controls?.[modeData];
  const buttonBackground = toColorValue(controls?.buttonBackground, mode, 'button', '#4dd9b8');
  const buttonText = controls?.buttonTextColor || '#0f1214';
  const buttonBorder = controls?.buttonBorderColor || '#4dd9b8';
  const linkColor = controls?.linkColor || (mode === 'light' ? '#2563eb' : '#60a5fa');
  const linkUnderlineStyle = controls?.linkUnderlineStyle || 'underline';

  // Extract button styling
  const buttonBorderWidth = parseInt(controls?.buttonBorderWidth || '1');
  const buttonBorderRadius = parseInt(controls?.buttonBorderRadius || '6');
  const buttonBorderStyle = controls?.buttonBorderStyle || 'solid';

  // Extract bloom colors
  const bloom = meta.bloom?.[modeData];
  const bloomPrimary = toColorValue(bloom?.primary, mode, 'primary');
  const bloomSecondary = toColorValue(bloom?.secondary, mode, 'secondary');
  const bloomTertiary = toColorValue(bloom?.tertiary, mode, 'tertiary');
  const bloomQuaternary = toColorValue(bloom?.quaternary, mode, 'quaternary');
  const bloomBorderColor = bloom?.borderColor;
  const bloomBorderWidth = parseFloat(bloom?.borderWidth || '0');

  // Extract shadows
  const panelShadow = extractShadow(
    content?.panelShadowEnabled,
    content?.panelShadowColor,
    content?.panelShadowOffsetX,
    content?.panelShadowOffsetY,
    content?.panelShadowBlurRadius,
    content?.panelShadowOpacity
  );

  const buttonShadow = extractShadow(
    controls?.buttonShadowEnabled,
    controls?.buttonShadowColor,
    controls?.buttonShadowOffsetX,
    controls?.buttonShadowOffsetY,
    controls?.buttonShadowBlurRadius,
    controls?.buttonShadowOpacity
  );

  const bloomShadow = extractShadow(
    bloom?.shadowEnabled,
    bloom?.shadowColor,
    bloom?.shadowOffsetX,
    bloom?.shadowOffsetY,
    bloom?.shadowBlurRadius,
    bloom?.shadowOpacity
  );

  // Get font family
  const fontFamily = getFontFamily(content?.font);

  // Get font sizes based on font type
  const fontType = (content?.font || 'sans-serif') as FontType;
  const fontSize = FONT_SIZES[fontType];
  const lineHeight = FONT_SIZES.lineHeight;

  return {
    colors: {
      primary,
      secondary,
      tertiary,
      quaternary,
      background,
      panel,
      text,
      border: borderColor,
      buttonBackground,
      buttonText,
      buttonBorder,
      link: linkColor,
      selection,
      bloomPrimary,
      bloomSecondary,
      bloomTertiary,
      bloomQuaternary,
      bloomBorder: bloomBorderColor,
    },
    spacing: DEFAULT_SPACING,
    typography: {
      fontFamily,
      fontSize,
      lineHeight,
    },
    borders: {
      radius: borderRadius,
      width: borderWidth,
      style: borderStyle,
      color: borderColor,
    },
    button: {
      borderRadius: buttonBorderRadius,
      borderWidth: buttonBorderWidth,
      borderStyle: buttonBorderStyle,
    },
    bloom: {
      borderWidth: bloomBorderWidth,
    },
    link: {
      underlineStyle: linkUnderlineStyle,
    },
    shadows: {
      panel: panelShadow,
      button: buttonShadow,
      bloom: bloomShadow,
    },
  };
}

/**
 * Get default design tokens (when no theme is available)
 */
export function getDefaultTokens(): DesignTokens {
  return {
    colors: {
      primary: '#2a3d2c',
      secondary: '#426046',
      tertiary: '#58825e',
      quaternary: '#73a079',
      background: '#ffffff',
      panel: '#f5f5f5',
      text: '#000000',
      border: '#cccccc',
      buttonBackground: { type: 'solid', value: '#4dd9b8' },
      buttonText: '#0f1214',
      buttonBorder: '#4dd9b8',
      link: '#2563eb',
      selection: '#b3d9ff',
      bloomPrimary: { type: 'solid', value: '#2a3d2c' },
      bloomSecondary: { type: 'solid', value: '#426046' },
      bloomTertiary: { type: 'solid', value: '#58825e' },
      bloomQuaternary: { type: 'solid', value: '#73a079' },
      bloomBorder: undefined,
    },
    spacing: DEFAULT_SPACING,
    typography: {
      fontFamily: DEFAULT_TYPOGRAPHY.fontFamily,
      fontSize: FONT_SIZES['sans-serif'],
      lineHeight: FONT_SIZES.lineHeight,
    },
    borders: {
      radius: 0,
      width: 1,
      style: 'solid',
      color: '#cccccc',
    },
    button: {
      borderRadius: 6,
      borderWidth: 1,
      borderStyle: 'solid',
    },
    bloom: {
      borderWidth: 0,
    },
    link: {
      underlineStyle: 'underline',
    },
    shadows: {},
  };
}
