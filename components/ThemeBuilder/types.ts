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
 * Per-mode theme settings (light or dark)
 */
export interface ThemeModeData {
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

  // Controls styling
  buttonBackgroundColor?: ColorValue;
  buttonTextColor?: string;
  buttonBorderColor?: string;
  buttonBorderWidth?: string;
  buttonBorderStyle?: 'solid' | 'dashed' | 'dotted';
  buttonBorderRadius?: string;
  linkColor?: string;
  linkUnderlineStyle?: 'none' | 'underline' | 'always';
}

/**
 * Theme form data (supports both light and dark modes)
 */
export interface ThemeFormData {
  // Shared across modes
  title: string;
  description?: string;
  type?: string;
  kind?: string;

  // Per-mode data
  light: ThemeModeData;
  dark: ThemeModeData;

  // UI state - which mode is currently being edited/previewed
  activeMode: 'light' | 'dark';
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
        solid?: string;
      };
      secondary?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      tertiary?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      quaternary?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      borderColor?: string;
      borderWidth?: string;
    };
    dark?: {
      primary?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      secondary?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      tertiary?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      quaternary?: {
        gradient?: GradientDefinition;
        solid?: string;
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
  controls?: {
    light?: {
      buttonBackground?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      buttonTextColor?: string;
      buttonBorderColor?: string;
      buttonBorderWidth?: string;
      buttonBorderStyle?: 'solid' | 'dashed' | 'dotted';
      buttonBorderRadius?: string;
      linkColor?: string;
      linkUnderlineStyle?: 'none' | 'underline' | 'always';
    };
    dark?: {
      buttonBackground?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
      buttonTextColor?: string;
      buttonBorderColor?: string;
      buttonBorderWidth?: string;
      buttonBorderStyle?: 'solid' | 'dashed' | 'dotted';
      buttonBorderRadius?: string;
      linkColor?: string;
      linkUnderlineStyle?: 'none' | 'underline' | 'always';
    };
  };
}

/**
 * Convert form data to API DTO
 */
export function formDataToDto(formData: ThemeFormData): ThemeDto {
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

  // Process both light and dark modes
  const processMode = (modeData: ThemeModeData) => {
    const primaryData = extractColor(modeData.primaryColor);
    const secondaryData = extractColor(modeData.secondaryColor);
    const tertiaryData = extractColor(modeData.tertiaryColor);
    const quaternaryData = extractColor(modeData.quaternaryColor);

    return {
      palette: {
        primary: primaryData.color,
        secondary: secondaryData.color,
        tertiary: tertiaryData.color,
        quaternary: quaternaryData.color,
      },
      bloom: {
        primary: primaryData.gradient ? { gradient: primaryData.gradient } : { solid: primaryData.color },
        secondary: secondaryData.gradient ? { gradient: secondaryData.gradient } : { solid: secondaryData.color },
        tertiary: tertiaryData.gradient ? { gradient: tertiaryData.gradient } : { solid: tertiaryData.color },
        quaternary: quaternaryData.gradient ? { gradient: quaternaryData.gradient } : { solid: quaternaryData.color },
        borderColor: modeData.bloomBorderColor,
        borderWidth: modeData.bloomBorderWidth,
      },
      content: {
        backgroundColor: modeData.backgroundColor,
        panelColor: modeData.panelColor,
        textColor: modeData.textColor,
        borderColor: modeData.borderColor,
        borderWidth: modeData.borderWidth,
        borderRadius: modeData.borderRadius,
        borderStyle: modeData.borderStyle,
        font: modeData.font,
      },
      controls: {
        buttonBackground: modeData.buttonBackgroundColor
          ? (modeData.buttonBackgroundColor.type === 'gradient'
              ? { gradient: modeData.buttonBackgroundColor.value }
              : { solid: modeData.buttonBackgroundColor.value })
          : undefined,
        buttonTextColor: modeData.buttonTextColor,
        buttonBorderColor: modeData.buttonBorderColor,
        buttonBorderWidth: modeData.buttonBorderWidth,
        buttonBorderStyle: modeData.buttonBorderStyle,
        buttonBorderRadius: modeData.buttonBorderRadius,
        linkColor: modeData.linkColor,
        linkUnderlineStyle: modeData.linkUnderlineStyle,
      },
    };
  };

  const lightMode = processMode(formData.light);
  const darkMode = processMode(formData.dark);

  const meta: ThemeMeta = {
    palette: {
      light: lightMode.palette,
      dark: darkMode.palette,
    },
    bloom: {
      light: lightMode.bloom,
      dark: darkMode.bloom,
    },
    content: {
      light: lightMode.content,
      dark: darkMode.content,
    },
    controls: {
      light: lightMode.controls,
      dark: darkMode.controls,
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

  // Helper to reconstruct ColorValue from palette + optional bloom data
  const reconstructColor = (
    paletteColor?: string,
    bloomData?: { gradient?: GradientDefinition; solid?: string }
  ): ColorValue => {
    if (bloomData?.gradient) {
      return { type: 'gradient', value: bloomData.gradient };
    }
    // Use solid from bloom if present, otherwise use palette color
    return { type: 'solid', value: bloomData?.solid || paletteColor || '#000000' };
  };

  // Process a mode's data
  const processMode = (
    paletteColors: any = {},
    bloomSettings: any = {},
    contentSettings: any = {},
    controlsSettings: any = {}
  ): ThemeModeData => {
    return {
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
      buttonBackgroundColor: controlsSettings.buttonBackground
        ? (controlsSettings.buttonBackground.gradient
            ? { type: 'gradient', value: controlsSettings.buttonBackground.gradient }
            : { type: 'solid', value: controlsSettings.buttonBackground.solid || '#4dd9b8' })
        : { type: 'solid', value: '#4dd9b8' },
      buttonTextColor: controlsSettings.buttonTextColor,
      buttonBorderColor: controlsSettings.buttonBorderColor,
      buttonBorderWidth: controlsSettings.buttonBorderWidth,
      buttonBorderStyle: controlsSettings.buttonBorderStyle,
      buttonBorderRadius: controlsSettings.buttonBorderRadius,
      linkColor: controlsSettings.linkColor,
      linkUnderlineStyle: controlsSettings.linkUnderlineStyle,
    };
  };

  // Load both modes (use defaults if not present)
  const defaults = getDefaultThemeFormData();
  const light = meta?.palette?.light
    ? processMode(meta.palette.light, meta.bloom?.light, meta.content?.light, meta.controls?.light)
    : defaults.light;
  const dark = meta?.palette?.dark
    ? processMode(meta.palette.dark, meta.bloom?.dark, meta.content?.dark, meta.controls?.dark)
    : defaults.dark;

  return {
    title: dto.title,
    description: dto.description,
    type: dto.type,
    kind: dto.kind,
    light,
    dark,
    activeMode: 'light', // Default to light mode when loading
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
    light: {
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
      buttonBackgroundColor: { type: 'solid', value: '#4dd9b8' },
      buttonTextColor: '#0f1214',
      buttonBorderColor: '#4dd9b8',
      buttonBorderWidth: '1',
      buttonBorderStyle: 'solid',
      buttonBorderRadius: '6',
      linkColor: '#2563eb',
      linkUnderlineStyle: 'underline',
    },
    dark: {
      primaryColor: { type: 'solid', value: '#2a3d2c' },
      secondaryColor: { type: 'solid', value: '#426046' },
      tertiaryColor: { type: 'solid', value: '#58825e' },
      quaternaryColor: { type: 'solid', value: '#73a079' },
      bloomBorderColor: '#000000',
      bloomBorderWidth: '0',
      borderWidth: '1',
      borderRadius: '0',
      borderColor: '#333333',
      borderStyle: 'solid',
      backgroundColor: '#0f1214',
      panelColor: '#1a1f24',
      textColor: '#e8eef2',
      font: 'sans-serif',
      buttonBackgroundColor: { type: 'solid', value: '#4dd9b8' },
      buttonTextColor: '#0f1214',
      buttonBorderColor: '#4dd9b8',
      buttonBorderWidth: '1',
      buttonBorderStyle: 'solid',
      buttonBorderRadius: '6',
      linkColor: '#60a5fa',
      linkUnderlineStyle: 'underline',
    },
    activeMode: 'light',
  };
}
