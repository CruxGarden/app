import { StyleSheet } from 'react-native-unistyles';

const lightTheme = {
  colors: {
    primary: '#ff1ff4',
    secondary: '#1ff4ff',
  },
  gap: (v: number) => v * 8,
  fonts: {
    regular: 'WorkSans_400Regular',
    medium: 'WorkSans_500Medium',
    semiBold: 'WorkSans_600SemiBold',
    bold: 'WorkSans_700Bold',
    mono: 'IBMPlexMono_400Regular',
    serif: 'CrimsonPro_300Light',
  },
};

const otherTheme = {
  colors: {
    primary: '#aa12ff',
    secondary: 'pink',
  },
  gap: (v: number) => v * 8,
  fonts: {
    regular: 'WorkSans_400Regular',
    medium: 'WorkSans_500Medium',
    semiBold: 'WorkSans_600SemiBold',
    bold: 'WorkSans_700Bold',
    mono: 'IBMPlexMono_400Regular',
    serif: 'CrimsonPro_300Light',
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
