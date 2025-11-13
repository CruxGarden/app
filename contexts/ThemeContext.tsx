/**
 * Theme Context
 *
 * Provides theme data and syncs with react-native-unistyles
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Appearance } from 'react-native';
import { UnistylesRuntime } from 'react-native-unistyles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeDesignTokens,
  type DesignTokens,
  type Theme,
} from '@/utils/designTokens';

const THEME_STORAGE_KEY = '@crux_garden:active_theme';
const MODE_STORAGE_KEY = '@crux_garden:theme_mode';

export type ThemeMode = 'light' | 'dark' | 'auto';

export interface ThemeContextValue {
  /** Current active theme (null if using default) */
  theme: Theme | null;

  /** Current mode ('light', 'dark', or 'auto') */
  mode: ThemeMode;

  /** Resolved mode (auto resolves to light or dark) */
  resolvedMode: 'light' | 'dark';

  /** Computed design tokens */
  tokens: DesignTokens;

  /** Switch to a different theme */
  setTheme: (theme: Theme | null) => Promise<void>;

  /** Change theme mode */
  setMode: (mode: ThemeMode) => Promise<void>;

  /** Reload theme from storage */
  reloadTheme: () => Promise<void>;

  /** Check if currently loading */
  isLoading: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
}

/**
 * Default bundled theme (matches theme builder defaults)
 */
const DEFAULT_THEME: Theme = {
  key: 'default',
  title: 'Default Theme',
  description: 'Built-in default theme for Crux Garden',
  type: 'default',
  kind: 'system',
  meta: {
    palette: {
      light: {
        primary: '#2a3d2c',
        secondary: '#426046',
        tertiary: '#58825e',
        quaternary: '#73a079',
      },
      dark: {
        primary: '#2a3d2c',
        secondary: '#426046',
        tertiary: '#58825e',
        quaternary: '#73a079',
      },
    },
    bloom: {
      light: {
        primary: { solid: '#0a594d' },
        secondary: { solid: '#127566' },
        tertiary: { solid: '#1a9179' },
        quaternary: { solid: '#2eb09a' },
        borderColor: '#4dd9b8',
        borderWidth: '9',
      },
      dark: {
        primary: { solid: '#02241c' },
        secondary: { solid: '#02382b' },
        tertiary: { solid: '#044e3d' },
        quaternary: { solid: '#047057' },
        borderColor: '#4dd9b8',
        borderWidth: '9',
      },
    },
    content: {
      light: {
        backgroundColor: '#f5f7f8',
        panelColor: '#ffffff',
        textColor: '#000000',
        borderColor: '#cccccc',
        borderWidth: '1',
        borderRadius: '12',
        borderStyle: 'solid',
        font: 'sans-serif',
        selectionColor: '#b3d9ff',
      },
      dark: {
        backgroundColor: '#0f1214',
        panelColor: '#1a1f24',
        textColor: '#e8eef2',
        borderColor: '#333333',
        borderWidth: '1',
        borderRadius: '12',
        borderStyle: 'solid',
        font: 'sans-serif',
        selectionColor: '#4a9eff',
      },
    },
    controls: {
      light: {
        buttonBackground: { solid: '#4dd9b8' },
        buttonTextColor: '#0f1214',
        buttonBorderColor: '#4dd9b8',
        buttonBorderWidth: '1',
        buttonBorderStyle: 'solid',
        buttonBorderRadius: '6',
        linkColor: '#2563eb',
        linkUnderlineStyle: 'underline',
      },
      dark: {
        buttonBackground: { solid: '#4dd9b8' },
        buttonTextColor: '#0f1214',
        buttonBorderColor: '#4dd9b8',
        buttonBorderWidth: '1',
        buttonBorderStyle: 'solid',
        buttonBorderRadius: '6',
        linkColor: '#60a5fa',
        linkUnderlineStyle: 'underline',
      },
    },
  },
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme | null>(null);
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [systemColorScheme, setSystemColorScheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'
  );
  const [isLoading, setIsLoading] = useState(true);

  // Compute resolved mode from mode state
  const resolvedMode: 'light' | 'dark' = mode === 'auto' ? systemColorScheme : mode;

  // Compute design tokens from current theme and resolved mode
  const activeTheme = theme || DEFAULT_THEME;
  const tokens = computeDesignTokens(activeTheme, resolvedMode);

  // Listen to system color scheme changes
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      const newScheme = colorScheme === 'dark' ? 'dark' : 'light';
      setSystemColorScheme(newScheme);
      if (mode === 'auto') {
        UnistylesRuntime.setTheme(newScheme);
      }
    });

    return () => subscription.remove();
  }, [mode]);

  // Sync Unistyles theme when resolved mode changes
  useEffect(() => {
    UnistylesRuntime.setTheme(resolvedMode);
  }, [resolvedMode]);

  // Load theme and mode from storage on mount
  useEffect(() => {
    loadFromStorage();
  }, []);

  /**
   * Load theme and mode from AsyncStorage
   */
  const loadFromStorage = async () => {
    try {
      setIsLoading(true);

      // Load saved mode
      const savedMode = await AsyncStorage.getItem(MODE_STORAGE_KEY);
      if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'auto') {
        setModeState(savedMode);

        // Apply mode to Unistyles
        if (savedMode === 'auto') {
          const systemScheme = Appearance.getColorScheme();
          UnistylesRuntime.setTheme(systemScheme === 'dark' ? 'dark' : 'light');
        } else {
          UnistylesRuntime.setTheme(savedMode);
        }
      }

      // Load saved theme
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme) {
        try {
          const parsedTheme = JSON.parse(savedTheme) as Theme;
          setThemeState(parsedTheme);
        } catch (err) {
          console.error('Failed to parse saved theme:', err);
          setThemeState(null);
        }
      }
    } catch (err) {
      console.error('Failed to load theme from storage:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Save theme to storage and update state
   */
  const setTheme = useCallback(async (newTheme: Theme | null) => {
    try {
      setThemeState(newTheme);

      if (newTheme) {
        await AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(newTheme));
      } else {
        await AsyncStorage.removeItem(THEME_STORAGE_KEY);
      }
    } catch (err) {
      console.error('Failed to save theme:', err);
    }
  }, []);

  /**
   * Save mode to storage and update Unistyles
   */
  const setMode = useCallback(async (newMode: ThemeMode) => {
    try {
      setModeState(newMode);
      await AsyncStorage.setItem(MODE_STORAGE_KEY, newMode);

      // Update Unistyles theme
      if (newMode === 'auto') {
        const systemScheme = Appearance.getColorScheme();
        UnistylesRuntime.setTheme(systemScheme === 'dark' ? 'dark' : 'light');
      } else {
        UnistylesRuntime.setTheme(newMode);
      }
    } catch (err) {
      console.error('Failed to save mode:', err);
    }
  }, []);

  /**
   * Reload theme from storage (useful after theme updates)
   */
  const reloadTheme = useCallback(async () => {
    await loadFromStorage();
  }, []);

  const value: ThemeContextValue = {
    theme,
    mode,
    resolvedMode,
    tokens,
    setTheme,
    setMode,
    reloadTheme,
    isLoading,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

/**
 * Hook to access theme context
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}

/**
 * Export default theme constant
 */
export { DEFAULT_THEME };
