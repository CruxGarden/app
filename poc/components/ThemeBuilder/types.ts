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

  // Bloom shadow
  bloomShadowEnabled?: boolean;
  bloomShadowColor?: string;
  bloomShadowOffsetX?: string;
  bloomShadowOffsetY?: string;
  bloomShadowBlurRadius?: string;
  bloomShadowOpacity?: string;

  // UI styling
  borderRadius?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  backgroundColor?: string;
  panelColor?: string;
  textColor?: string;
  font?: string;

  // Panel shadow
  panelShadowEnabled?: boolean;
  panelShadowColor?: string;
  panelShadowOffsetX?: string;
  panelShadowOffsetY?: string;
  panelShadowBlurRadius?: string;
  panelShadowOpacity?: string;

  // Controls styling
  buttonBackgroundColor?: ColorValue;
  buttonTextColor?: string;
  buttonBorderColor?: string;
  buttonBorderWidth?: string;
  buttonBorderStyle?: 'solid' | 'dashed' | 'dotted';
  buttonBorderRadius?: string;

  // Button shadow
  buttonShadowEnabled?: boolean;
  buttonShadowColor?: string;
  buttonShadowOffsetX?: string;
  buttonShadowOffsetY?: string;
  buttonShadowBlurRadius?: string;
  buttonShadowOpacity?: string;

  linkColor?: string;
  linkUnderlineStyle?: 'none' | 'underline' | 'always';

  // Text selection
  selectionColor?: string;
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
  meta: ThemeMeta;
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
      shadowEnabled?: boolean;
      shadowColor?: string;
      shadowOffsetX?: string;
      shadowOffsetY?: string;
      shadowBlurRadius?: string;
      shadowOpacity?: string;
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
      buttonBackground?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
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
      buttonBackground?: {
        gradient?: GradientDefinition;
        solid?: string;
      };
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
}

/**
 * Convert form data to API DTO
 */
export function formDataToDto(formData: ThemeFormData): ThemeDto {
  // Extract color and gradient separately
  const extractColor = (
    colorValue: ColorValue
  ): { color: string; gradient?: GradientDefinition } => {
    if (colorValue.type === 'solid') {
      return { color: colorValue.value };
    } else {
      return {
        color: colorValue.value.stops[0].color,
        gradient: colorValue.value, // Keep the full gradient including ID
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
        primary: primaryData.gradient
          ? { gradient: primaryData.gradient }
          : { solid: primaryData.color },
        secondary: secondaryData.gradient
          ? { gradient: secondaryData.gradient }
          : { solid: secondaryData.color },
        tertiary: tertiaryData.gradient
          ? { gradient: tertiaryData.gradient }
          : { solid: tertiaryData.color },
        quaternary: quaternaryData.gradient
          ? { gradient: quaternaryData.gradient }
          : { solid: quaternaryData.color },
        borderColor: modeData.bloomBorderColor,
        borderWidth: modeData.bloomBorderWidth,
        shadowEnabled: modeData.bloomShadowEnabled,
        shadowColor: modeData.bloomShadowColor,
        shadowOffsetX: modeData.bloomShadowOffsetX,
        shadowOffsetY: modeData.bloomShadowOffsetY,
        shadowBlurRadius: modeData.bloomShadowBlurRadius,
        shadowOpacity: modeData.bloomShadowOpacity,
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
        panelShadowEnabled: modeData.panelShadowEnabled,
        panelShadowColor: modeData.panelShadowColor,
        panelShadowOffsetX: modeData.panelShadowOffsetX,
        panelShadowOffsetY: modeData.panelShadowOffsetY,
        panelShadowBlurRadius: modeData.panelShadowBlurRadius,
        panelShadowOpacity: modeData.panelShadowOpacity,
        selectionColor: modeData.selectionColor,
      },
      controls: {
        buttonBackground: modeData.buttonBackgroundColor
          ? modeData.buttonBackgroundColor.type === 'gradient'
            ? { gradient: modeData.buttonBackgroundColor.value } // Keep the full gradient including ID
            : { solid: modeData.buttonBackgroundColor.value }
          : undefined,
        buttonTextColor: modeData.buttonTextColor,
        buttonBorderColor: modeData.buttonBorderColor,
        buttonBorderWidth: modeData.buttonBorderWidth,
        buttonBorderStyle: modeData.buttonBorderStyle,
        buttonBorderRadius: modeData.buttonBorderRadius,
        buttonShadowEnabled: modeData.buttonShadowEnabled,
        buttonShadowColor: modeData.buttonShadowColor,
        buttonShadowOffsetX: modeData.buttonShadowOffsetX,
        buttonShadowOffsetY: modeData.buttonShadowOffsetY,
        buttonShadowBlurRadius: modeData.buttonShadowBlurRadius,
        buttonShadowOpacity: modeData.buttonShadowOpacity,
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
export function dtoToFormData(
  dto: ThemeDto | { title: string; description?: string; type?: string; kind?: string; meta?: any }
): ThemeFormData {
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
      bloomShadowEnabled: bloomSettings?.shadowEnabled,
      bloomShadowColor: bloomSettings?.shadowColor,
      bloomShadowOffsetX: bloomSettings?.shadowOffsetX,
      bloomShadowOffsetY: bloomSettings?.shadowOffsetY,
      bloomShadowBlurRadius: bloomSettings?.shadowBlurRadius,
      bloomShadowOpacity: bloomSettings?.shadowOpacity,
      backgroundColor: contentSettings.backgroundColor,
      panelColor: contentSettings.panelColor,
      textColor: contentSettings.textColor,
      borderColor: contentSettings.borderColor,
      borderWidth: contentSettings.borderWidth,
      borderRadius: contentSettings.borderRadius,
      borderStyle: contentSettings.borderStyle,
      font: contentSettings.font,
      panelShadowEnabled: contentSettings.panelShadowEnabled,
      panelShadowColor: contentSettings.panelShadowColor,
      panelShadowOffsetX: contentSettings.panelShadowOffsetX,
      panelShadowOffsetY: contentSettings.panelShadowOffsetY,
      panelShadowBlurRadius: contentSettings.panelShadowBlurRadius,
      panelShadowOpacity: contentSettings.panelShadowOpacity,
      selectionColor: contentSettings.selectionColor,
      buttonBackgroundColor: controlsSettings.buttonBackground
        ? controlsSettings.buttonBackground.gradient
          ? { type: 'gradient', value: controlsSettings.buttonBackground.gradient }
          : { type: 'solid', value: controlsSettings.buttonBackground.solid || '#4dd9b8' }
        : { type: 'solid', value: '#4dd9b8' },
      buttonTextColor: controlsSettings.buttonTextColor,
      buttonBorderColor: controlsSettings.buttonBorderColor,
      buttonBorderWidth: controlsSettings.buttonBorderWidth,
      buttonBorderStyle: controlsSettings.buttonBorderStyle,
      buttonBorderRadius: controlsSettings.buttonBorderRadius,
      buttonShadowEnabled: controlsSettings.buttonShadowEnabled,
      buttonShadowColor: controlsSettings.buttonShadowColor,
      buttonShadowOffsetX: controlsSettings.buttonShadowOffsetX,
      buttonShadowOffsetY: controlsSettings.buttonShadowOffsetY,
      buttonShadowBlurRadius: controlsSettings.buttonShadowBlurRadius,
      buttonShadowOpacity: controlsSettings.buttonShadowOpacity,
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
 * Get default theme form data (Nascent Web - unadorned Web 1.0 style)
 */
export function getDefaultThemeFormData(): ThemeFormData {
  return {
    title: 'Nascent Web',
    description: 'An unadorned, web 1.0 style',
    type: 'custom',
    kind: 'user',
    light: {
      // Pure white bloom
      primaryColor: { type: 'solid', value: '#ffffff' },
      secondaryColor: { type: 'solid', value: '#ffffff' },
      tertiaryColor: { type: 'solid', value: '#ffffff' },
      quaternaryColor: { type: 'solid', value: '#ffffff' },
      bloomBorderColor: '#000000',
      bloomBorderWidth: '20',
      bloomShadowEnabled: false,
      bloomShadowColor: '#000000',
      bloomShadowOffsetX: '2',
      bloomShadowOffsetY: '4',
      bloomShadowBlurRadius: '8',
      bloomShadowOpacity: '0.15',
      // Pure white content with no borders
      borderWidth: '0',
      borderRadius: '0',
      borderColor: '#000000',
      borderStyle: 'solid',
      backgroundColor: '#ffffff',
      panelColor: '#ffffff',
      textColor: '#000000',
      font: 'sans-serif',
      panelShadowEnabled: false,
      panelShadowColor: '#000000',
      panelShadowOffsetX: '0',
      panelShadowOffsetY: '1',
      panelShadowBlurRadius: '3',
      panelShadowOpacity: '0.05',
      // Light gray button
      buttonBackgroundColor: { type: 'solid', value: '#ebeaea' },
      buttonTextColor: '#000000',
      buttonBorderColor: '#8a8a8a',
      buttonBorderWidth: '2',
      buttonBorderStyle: 'solid',
      buttonBorderRadius: '6',
      buttonShadowEnabled: false,
      buttonShadowColor: '#000000',
      buttonShadowOffsetX: '0',
      buttonShadowOffsetY: '2',
      buttonShadowBlurRadius: '4',
      buttonShadowOpacity: '0.1',
      // Classic blue link
      linkColor: '#0000ee',
      linkUnderlineStyle: 'always',
      selectionColor: '#b3d9ff',
    },
    dark: {
      // Pure black bloom
      primaryColor: { type: 'solid', value: '#000000' },
      secondaryColor: { type: 'solid', value: '#000000' },
      tertiaryColor: { type: 'solid', value: '#000000' },
      quaternaryColor: { type: 'solid', value: '#000000' },
      bloomBorderColor: '#ffffff',
      bloomBorderWidth: '20',
      bloomShadowEnabled: false,
      bloomShadowColor: '#000000',
      bloomShadowOffsetX: '2',
      bloomShadowOffsetY: '4',
      bloomShadowBlurRadius: '8',
      bloomShadowOpacity: '0.15',
      // Pure black content with no borders
      borderWidth: '0',
      borderRadius: '0',
      borderColor: '#ffffff',
      borderStyle: 'solid',
      backgroundColor: '#000000',
      panelColor: '#000000',
      textColor: '#ffffff',
      font: 'sans-serif',
      panelShadowEnabled: false,
      panelShadowColor: '#000000',
      panelShadowOffsetX: '0',
      panelShadowOffsetY: '1',
      panelShadowBlurRadius: '3',
      panelShadowOpacity: '0.05',
      // Light gray button (same as light mode)
      buttonBackgroundColor: { type: 'solid', value: '#ebeaea' },
      buttonTextColor: '#000000',
      buttonBorderColor: '#8a8a8a',
      buttonBorderWidth: '2',
      buttonBorderStyle: 'solid',
      buttonBorderRadius: '6',
      buttonShadowEnabled: false,
      buttonShadowColor: '#000000',
      buttonShadowOffsetX: '0',
      buttonShadowOffsetY: '2',
      buttonShadowBlurRadius: '4',
      buttonShadowOpacity: '0.1',
      // Classic cyan link
      linkColor: '#00ffff',
      linkUnderlineStyle: 'always',
      selectionColor: '#4a9eff',
    },
    activeMode: 'light',
  };
}
