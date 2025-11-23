import { StyleSheet } from 'react-native-unistyles';
import type { DesignTokens } from '@/utils/designTokens';
import { getDefaultTokens } from '@/utils/designTokens';

const fonts = {
  // IBM Plex Sans - primary sans-serif
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semiBold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
  // IBM Plex Mono - monospace
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
  monoBold: 'IBMPlexMono_700Bold',
  // IBM Plex Serif - serif
  serif: 'IBMPlexSerif_300Light',
  serifRegular: 'IBMPlexSerif_400Regular',
  serifMedium: 'IBMPlexSerif_500Medium',
  serifSemiBold: 'IBMPlexSerif_600SemiBold',
  serifBold: 'IBMPlexSerif_700Bold',
};

export function tokensToUnistylesTheme(tokens: DesignTokens) {
  return {
    colors: {
      primary: tokens.colors.primary,
      secondary: tokens.colors.secondary,
      tertiary: tokens.colors.tertiary,
      quaternary: tokens.colors.quaternary,

      background: tokens.colors.background,
      panel: tokens.colors.panel,
      text: tokens.colors.text,
      border: tokens.colors.border,

      buttonBackground: tokens.colors.buttonBackground,
      buttonText: tokens.colors.buttonText,
      buttonBorder: tokens.colors.buttonBorder,
      link: tokens.colors.link,
      selection: tokens.colors.selection,

      bloomPrimary:
        tokens.colors.bloomPrimary.type === 'solid'
          ? tokens.colors.bloomPrimary.value
          : tokens.colors.bloomPrimary.value.stops[0].color,
      bloomSecondary:
        tokens.colors.bloomSecondary.type === 'solid'
          ? tokens.colors.bloomSecondary.value
          : tokens.colors.bloomSecondary.value.stops[0].color,
      bloomTertiary:
        tokens.colors.bloomTertiary.type === 'solid'
          ? tokens.colors.bloomTertiary.value
          : tokens.colors.bloomTertiary.value.stops[0].color,
      bloomQuaternary:
        tokens.colors.bloomQuaternary.type === 'solid'
          ? tokens.colors.bloomQuaternary.value
          : tokens.colors.bloomQuaternary.value.stops[0].color,
      bloomBorder: tokens.colors.bloomBorder,
    },
    spacing: tokens.spacing,
    typography: {
      fontFamily: tokens.typography.fontFamily,
      fontSize: tokens.typography.fontSize,
      lineHeight: tokens.typography.lineHeight,
    },
    borders: tokens.borders,
    button: tokens.button,
    bloom: tokens.bloom,
    link: tokens.link,
    shadows: tokens.shadows,
    fonts,
    gap: (v: number) => v * 8,
  };
}

const defaultTokens = getDefaultTokens();
const defaultTheme = tokensToUnistylesTheme(defaultTokens);

const lightTheme = { ...defaultTheme };
const darkTheme = { ...defaultTheme };

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
};

const breakpoints = {
  xs: 0,
  sm: 300,
  md: 500,
  lg: 800,
  xl: 1200,
};

type AppBreakpoints = typeof breakpoints;
type AppThemes = typeof appThemes;

declare module 'react-native-unistyles' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  settings: {
    initialTheme: 'light',
  },
  breakpoints,
  themes: appThemes,
});
