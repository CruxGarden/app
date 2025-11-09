/**
 * Theme Builder Types
 *
 * Types for the theme builder component, including support for both
 * solid colors and gradients.
 */

import type { GradientDefinition } from '@/components/CruxBloom';

/**
 * Color value - can be either a solid hex color or a gradient definition
 */
export type ColorValue =
  | { type: 'solid'; value: string }
  | { type: 'gradient'; value: GradientDefinition };

/**
 * Theme form data
 */
export interface ThemeFormData {
  title: string;
  description?: string;
  type?: string;
  kind?: string;

  // Bloom colors (can be solid or gradient)
  primaryColor: ColorValue;
  secondaryColor: ColorValue;
  tertiaryColor: ColorValue;
  quaternaryColor: ColorValue;

  // Bloom styling
  bloomBorderColor?: string;
  bloomBorderWidth?: string;

  // UI styling
  borderRadius?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  backgroundColor?: string;
  panelColor?: string;
  textColor?: string;
  font?: string;
  mode?: string;
}

/**
 * Theme DTO for API submission
 * Details at top level, palette/bloom/content in meta
 */
export interface ThemeDto {
  title: string;
  description?: string;
  type?: string;
  kind?: string;
  meta?: ThemeMeta;
}

/**
 * Theme metadata with palette, bloom, and content sections
 */
export interface ThemeMeta {
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
      primary?: {
        gradient?: GradientDefinition;
      };
      secondary?: {
        gradient?: GradientDefinition;
      };
      tertiary?: {
        gradient?: GradientDefinition;
      };
      quaternary?: {
        gradient?: GradientDefinition;
      };
      borderColor?: string;
      borderWidth?: string;
    };
    dark?: {
      primary?: {
        gradient?: GradientDefinition;
      };
      secondary?: {
        gradient?: GradientDefinition;
      };
      tertiary?: {
        gradient?: GradientDefinition;
      };
      quaternary?: {
        gradient?: GradientDefinition;
      };
      borderColor?: string;
      borderWidth?: string;
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
    };
  };
}

/**
 * Convert form data to API DTO
 */
export function formDataToDto(formData: ThemeFormData): ThemeDto {
  const isLightMode = formData.mode !== 'dark';
  const modeKey = isLightMode ? 'light' : 'dark';

  // Extract color and gradient separately
  const extractColor = (colorValue: ColorValue): { color: string; gradient?: GradientDefinition } => {
    if (colorValue.type === 'solid') {
      return { color: colorValue.value };
    } else {
      return {
        color: colorValue.value.stops[0].color,
        gradient: colorValue.value,
      };
    }
  };

  const primaryData = extractColor(formData.primaryColor);
  const secondaryData = extractColor(formData.secondaryColor);
  const tertiaryData = extractColor(formData.tertiaryColor);
  const quaternaryData = extractColor(formData.quaternaryColor);

  const meta: ThemeMeta = {
    palette: {
      [modeKey]: {
        primary: primaryData.color,
        secondary: secondaryData.color,
        tertiary: tertiaryData.color,
        quaternary: quaternaryData.color,
      },
    },
    bloom: {
      [modeKey]: {
        primary: primaryData.gradient ? { gradient: primaryData.gradient } : undefined,
        secondary: secondaryData.gradient ? { gradient: secondaryData.gradient } : undefined,
        tertiary: tertiaryData.gradient ? { gradient: tertiaryData.gradient } : undefined,
        quaternary: quaternaryData.gradient ? { gradient: quaternaryData.gradient } : undefined,
        borderColor: formData.bloomBorderColor,
        borderWidth: formData.bloomBorderWidth,
      },
    },
    content: {
      [modeKey]: {
        backgroundColor: formData.backgroundColor,
        panelColor: formData.panelColor,
        textColor: formData.textColor,
        borderColor: formData.borderColor,
        borderWidth: formData.borderWidth,
        borderRadius: formData.borderRadius,
        borderStyle: formData.borderStyle,
        font: formData.font,
      },
    },
  };

  return {
    title: formData.title,
    description: formData.description,
    type: formData.type,
    kind: formData.kind,
    meta,
  };
}

/**
 * Convert API DTO to form data
 */
export function dtoToFormData(dto: ThemeDto): ThemeFormData {
  const meta = dto.meta;

  // Prefer light mode, fall back to dark mode
  const paletteColors = meta?.palette?.light || meta?.palette?.dark || {};
  const bloomSettings = meta?.bloom?.light || meta?.bloom?.dark || {};
  const contentSettings = meta?.content?.light || meta?.content?.dark || {};
  const mode = meta?.palette?.light ? 'light' : 'dark';

  // Helper to reconstruct ColorValue from palette + optional bloom gradient
  const reconstructColor = (
    paletteColor?: string,
    bloomData?: { gradient?: GradientDefinition }
  ): ColorValue => {
    if (bloomData?.gradient) {
      return { type: 'gradient', value: bloomData.gradient };
    }
    return { type: 'solid', value: paletteColor || '#000000' };
  };

  return {
    title: dto.title,
    description: dto.description,
    type: dto.type,
    kind: dto.kind,
    primaryColor: reconstructColor(paletteColors.primary, bloomSettings.primary),
    secondaryColor: reconstructColor(paletteColors.secondary, bloomSettings.secondary),
    tertiaryColor: reconstructColor(paletteColors.tertiary, bloomSettings.tertiary),
    quaternaryColor: reconstructColor(paletteColors.quaternary, bloomSettings.quaternary),
    bloomBorderColor: bloomSettings?.borderColor,
    bloomBorderWidth: bloomSettings?.borderWidth,
    backgroundColor: contentSettings.backgroundColor,
    panelColor: contentSettings.panelColor,
    textColor: contentSettings.textColor,
    borderColor: contentSettings.borderColor,
    borderWidth: contentSettings.borderWidth,
    borderRadius: contentSettings.borderRadius,
    borderStyle: contentSettings.borderStyle,
    font: contentSettings.font,
    mode,
  };
}

/**
 * Get default theme form data
 */
export function getDefaultThemeFormData(): ThemeFormData {
  return {
    title: '',
    description: '',
    type: '',
    kind: '',
    primaryColor: { type: 'solid', value: '#2a3d2c' },
    secondaryColor: { type: 'solid', value: '#426046' },
    tertiaryColor: { type: 'solid', value: '#58825e' },
    quaternaryColor: { type: 'solid', value: '#73a079' },
    bloomBorderColor: '#000000',
    bloomBorderWidth: '0',
    borderWidth: '1',
    borderRadius: '0',
    borderColor: '#cccccc',
    borderStyle: 'solid',
    backgroundColor: '#ffffff',
    panelColor: '#f5f5f5',
    textColor: '#000000',
    font: 'sans-serif',
    mode: 'light',
  };
}
