import { StyleSheet } from 'react-native-unistyles';

const lightTheme = {
  colors: {
    primary: '#ff1ff4',
    secondary: '#1ff4ff',
  },
  gap: (v: number) => v * 8,
  fonts: {
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
  },
};

const otherTheme = {
  colors: {
    primary: '#aa12ff',
    secondary: 'pink',
  },
  gap: (v: number) => v * 8,
  fonts: {
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
  },
};

const appThemes = {
  light: lightTheme,
  other: otherTheme,
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
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  settings: {
    initialTheme: 'light',
  },
  breakpoints,
  themes: appThemes,
});
