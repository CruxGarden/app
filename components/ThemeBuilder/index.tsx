/**
 * ThemeBuilder Component
 *
 * A comprehensive builder for creating and editing themes
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Platform } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import chroma from 'chroma-js';
import { faker } from '@faker-js/faker';
import { CruxBloom } from '@/components/CruxBloom';
import { Panel, Text as ThemedText, Button as ThemedButton, Link } from '@/components';
import { ColorPicker } from './ColorPicker';
import { HexColorInput } from './HexColorInput';
import { ShadowControls } from './ShadowControls';
import type { ThemeFormData, ThemeDto, ColorValue, ThemeModeData } from './types';
import { getDefaultThemeFormData, formDataToDto } from './types';
import { useTheme, ThemeContext } from '@/contexts/ThemeContext';
import type { Theme } from '@/utils/designTokens';
import { computeDesignTokens } from '@/utils/designTokens';

export interface ThemeBuilderProps {
  /** Initial theme data for editing (optional) */
  initialData?: ThemeFormData;
  /** Theme key when editing an existing theme (optional) */
  themeKey?: string;
  /** Callback when theme is saved - receives DTO and optional themeKey for updates */
  onSave: (theme: ThemeDto, themeKey?: string) => Promise<void>;
  /** Callback when cancelled */
  onCancel: () => void;
}

// ============================================================================
// DEVELOPMENT CONFIGURATION
// ============================================================================
// Full randomization mode - uses actual slider values without reductions
const FULL_RANDOMIZATION = true;

// Auto-randomize feature (randomizes theme on load and every 3 seconds)
const AUTO_RANDOMIZE_ENABLED = false;

// NOTE: UI colors (background, panel, border) can be randomly derived from different palette colors
// Each element has a 30% independent chance to use a different palette color for variety
// ============================================================================

// Font sizes are now imported from @/constants/fontSizes

// ============================================================================
// ANIMATED PREVIEW CONTAINER
// ============================================================================

interface AnimatedPreviewContainerProps {
  children: React.ReactNode;
  formData: ThemeFormData;
  mode: 'light' | 'dark';
  transitionDuration: number;
}

/**
 * Animated container that transitions background color
 */
const AnimatedPreviewContainer: React.FC<AnimatedPreviewContainerProps> = ({ children, formData, mode, transitionDuration }) => {
  const backgroundColor = formData[mode].backgroundColor || '#ffffff';

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(backgroundColor, { duration: transitionDuration }),
  }), [backgroundColor, transitionDuration]);

  return (
    <Animated.View style={[styles.previewContainer, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

// ============================================================================
// PREVIEW THEME PROVIDER
// ============================================================================

interface PreviewThemeProviderProps {
  children: React.ReactNode;
  formData: ThemeFormData;
  mode: 'light' | 'dark';
  transitionDuration: number;
}

/**
 * Provider that computes and provides theme tokens from formData for the preview
 * This temporarily overrides the global theme context for preview components
 */
const PreviewThemeProvider: React.FC<PreviewThemeProviderProps> = ({ children, formData, mode, transitionDuration }) => {
  // Convert formData to Theme object
  const previewTheme: Theme = useMemo(() => {
    const dto = formDataToDto(formData);
    return {
      key: 'preview',
      title: formData.title || 'Preview',
      description: formData.description,
      type: formData.type,
      kind: formData.kind,
      meta: dto.meta,
    };
  }, [formData]);

  // Compute design tokens from preview theme
  const tokens = useMemo(() => {
    return computeDesignTokens(previewTheme, mode);
  }, [previewTheme, mode]);

  // Create context value that matches ThemeContextValue interface
  const contextValue = useMemo(() => ({
    theme: previewTheme,
    mode: mode as 'light' | 'dark' | 'auto',
    resolvedMode: mode,
    tokens,
    transitionDuration,
    setTheme: async () => {},
    setMode: async () => {},
    reloadTheme: async () => {},
    isLoading: false,
  }), [previewTheme, mode, tokens, transitionDuration]);

  // Provide to ThemeContext to override parent context for preview
  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
};

export const ThemeBuilder: React.FC<ThemeBuilderProps> = ({
  initialData,
  themeKey,
  onSave,
  onCancel,
}) => {
  const { setTheme: setGlobalTheme } = useTheme();
  const [formData, setFormData] = useState<ThemeFormData>(
    initialData || getDefaultThemeFormData()
  );
  const [isSaving, setIsSaving] = useState(false);
  const isEditMode = !!themeKey;
  const [activeBloomTab, setActiveBloomTab] = useState<'primary' | 'secondary' | 'tertiary' | 'quaternary'>('primary');
  const [expandedSections, setExpandedSections] = useState<{
    details: boolean;
    palette: boolean;
    bloom: boolean;
    style: boolean;
    controls: boolean;
  }>({
    details: true,
    palette: false,
    bloom: false,
    style: false,
    controls: false,
  });

  const [baseHue, setBaseHue] = useState(180);
  const [baseSaturation, setBaseSaturation] = useState(65);
  const [baseLightness, setBaseLightness] = useState(50);
  const [selectedHarmony, setSelectedHarmony] = useState<'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'random'>('monochromatic');

  // Preview palette colors (updates as sliders change, but doesn't apply to theme until button clicked)
  const [previewPalette, setPreviewPalette] = useState<string[]>([]);

  // Palette color editing state
  const [editingPaletteIndex, setEditingPaletteIndex] = useState<number | null>(null);
  const [editingPaletteColor, setEditingPaletteColor] = useState<string>('#000000');

  // Random seed to force regeneration when clicking Random harmony multiple times
  const [randomSeed, setRandomSeed] = useState(0);

  // Transition duration for animations (0 = instant for manual edits, 300 = animated for bulk changes)
  const [previewTransitionDuration, setPreviewTransitionDuration] = useState(0);

  // Whether to update both modes (light and dark) or just the current active mode - per section
  const [updateBothModesPalette, setUpdateBothModesPalette] = useState(false);
  const [updateBothModesBloom, setUpdateBothModesBloom] = useState(false);
  const [updateBothModesStyle, setUpdateBothModesStyle] = useState(false);
  const [updateBothModesControls, setUpdateBothModesControls] = useState(false);

  /**
   * Executes a state update function with transitions enabled (300ms)
   * Use this for bulk operations like randomize/apply theme
   */
  const withTransition = (updateFn: () => void) => {
    setPreviewTransitionDuration(300);
    updateFn();
    // Reset to instant updates after transition completes
    setTimeout(() => setPreviewTransitionDuration(0), 350);
  };

  const toggleSection = (section: 'details' | 'palette' | 'bloom' | 'style' | 'controls') => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Auto-randomize on first load if no initialData
  useEffect(() => {
    if (AUTO_RANDOMIZE_ENABLED && !initialData) {
      // Randomize everything on first load
      randomizeAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Update preview palette when HSL or harmony changes
  useEffect(() => {
    const bloomColors = generatePaletteColors(baseHue, baseSaturation, baseLightness, selectedHarmony);
    setPreviewPalette(bloomColors);
  }, [baseHue, baseSaturation, baseLightness, selectedHarmony, randomSeed]);

  // Auto-randomization timer - runs every 3 seconds and toggles mode
  useEffect(() => {
    if (!AUTO_RANDOMIZE_ENABLED) return;

    const interval = setInterval(() => {
      randomizeAll();
      // Toggle between light and dark mode
      setFormData((prev) => ({
        ...prev,
        activeMode: prev.activeMode === 'light' ? 'dark' : 'light',
      }));
    }, 3000); // 3 seconds

    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply text selection color styling (web only)
  useEffect(() => {
    if (Platform.OS === 'web') {
      const selectionColor = formData[formData.activeMode].selectionColor;
      if (selectionColor) {
        // Remove existing selection style if present
        const existingStyle = document.getElementById('theme-builder-selection-style');
        if (existingStyle) {
          existingStyle.remove();
        }

        // Inject new selection style
        const style = document.createElement('style');
        style.id = 'theme-builder-selection-style';
        style.innerHTML = `
          #preview-panel ::selection {
            background-color: ${selectionColor};
          }
        `;
        document.head.appendChild(style);
      }
    }

    // Cleanup function
    return () => {
      if (Platform.OS === 'web') {
        const existingStyle = document.getElementById('theme-builder-selection-style');
        if (existingStyle) {
          existingStyle.remove();
        }
      }
    };
  }, [formData.activeMode, formData.light.selectionColor, formData.dark.selectionColor]);

  const handleFieldChange = <K extends keyof ThemeFormData>(
    field: K,
    value: ThemeFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Mode-aware field change for per-mode fields
  // Respects the section-specific updateBothModes setting to apply changes to both modes or just the active one
  const handleModeFieldChange = <K extends keyof ThemeModeData>(
    field: K,
    value: ThemeModeData[K],
    section: 'palette' | 'bloom' | 'style' | 'controls'
  ) => {
    // Determine which state to check based on section
    const updateBothModes =
      section === 'palette' ? updateBothModesPalette :
      section === 'bloom' ? updateBothModesBloom :
      section === 'style' ? updateBothModesStyle :
      updateBothModesControls;

    if (updateBothModes) {
      // Update both light and dark modes
      setFormData((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          [field]: value,
        },
        dark: {
          ...prev.dark,
          [field]: value,
        },
      }));
    } else {
      // Update only the active mode
      setFormData((prev) => ({
        ...prev,
        [prev.activeMode]: {
          ...prev[prev.activeMode],
          [field]: value,
        },
      }));
    }
  };

  const handleColorChange = (field: keyof Pick<ThemeModeData, 'primaryColor' | 'secondaryColor' | 'tertiaryColor' | 'quaternaryColor'>) => (value: ColorValue) => {
    handleModeFieldChange(field, value, 'bloom');
  };

  const handleSave = async () => {
    // Validate required fields
    if (!formData.title.trim()) {
      Alert.alert('Validation Error', 'Theme title is required');
      return;
    }

    try {
      setIsSaving(true);
      const dto = formDataToDto(formData);

      // Pass both DTO and themeKey to onSave
      // Parent component determines whether to create (POST) or update (PATCH)
      // and shows appropriate success alert
      await onSave(dto, themeKey);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save theme');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyTheme = async () => {
    try {
      const dto = formDataToDto(formData);

      // Convert DTO to Theme format
      const theme: Theme = {
        key: themeKey || 'preview',
        title: formData.title || 'Preview Theme',
        description: formData.description || 'Theme preview',
        type: formData.type || 'custom',
        kind: formData.kind || 'user',
        meta: dto.meta,
      };

      await setGlobalTheme(theme);
      Alert.alert('Theme Applied', 'The theme has been applied to the app. Toggle between light and dark mode to see both variants.');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to apply theme');
    }
  };

  const getBloomColor = (colorValue: ColorValue): string => {
    if (colorValue.type === 'solid') {
      return colorValue.value;
    } else {
      // For gradients, use the first stop color
      return colorValue.value.stops[0]?.color || '#000000';
    }
  };

  /**
   * Generate a readable text color for a given background color
   * @param backgroundColor - The background color to contrast against
   * @param targetRatio - Target WCAG contrast ratio (4.5 for AA, 7 for AAA)
   * @returns A text color that meets the target contrast ratio
   */
  const getReadableTextColor = (backgroundColor: string, targetRatio: number = 4.5): string => {
    try {
      const bgColor = chroma(backgroundColor);
      const bgLuminance = bgColor.luminance();
      const bgSaturation = bgColor.get('hsl.s');

      // If background is grayscale (saturation < 0.05), force grayscale text
      const isGrayscale = bgSaturation < 0.05;
      const useColorfulText = !isGrayscale && Math.random() > 0.5; // 50% chance of colorful text (only if bg has color)

      // Slightly muted white and black
      const mutedWhite = chroma.hsl(0, 0, 0.92 + Math.random() * 0.06).hex(); // 92-98% lightness
      const mutedBlack = chroma.hsl(0, 0, 0.04 + Math.random() * 0.08).hex(); // 4-12% lightness

      if (useColorfulText) {
        // Generate colorful text with hue from palette or complementary
        const bgHue = bgColor.get('hsl.h');

        // 50% chance to use palette hue, 50% complementary/analogous
        let textHue: number;
        if (Math.random() > 0.5) {
          // Use base hue from palette (with slight variation)
          textHue = (baseHue + (Math.random() * 60 - 30)) % 360;
        } else {
          // Use complementary or analogous hue
          const harmonyChoice = Math.random();
          if (harmonyChoice < 0.33) {
            textHue = (bgHue + 180) % 360; // Complementary
          } else if (harmonyChoice < 0.66) {
            textHue = (bgHue + 30 + Math.random() * 30) % 360; // Analogous
          } else {
            textHue = (bgHue - 30 - Math.random() * 30 + 360) % 360; // Analogous (other side)
          }
        }

        // Moderate saturation for readability
        const textSat = 0.3 + Math.random() * 0.4; // 30-70% saturation

        // Try different lightness values to find readable color
        if (bgLuminance > 0.5) {
          // Background is light, make text darker
          for (let lightness = 0.1; lightness <= 0.5; lightness += 0.05) {
            const testColor = chroma.hsl(textHue, textSat, lightness);
            if (chroma.contrast(bgColor, testColor) >= targetRatio) {
              return testColor.hex();
            }
          }
          // Fallback to muted black if colorful didn't work
          return chroma.contrast(bgColor, mutedBlack) >= targetRatio ? mutedBlack : '#000000';
        } else {
          // Background is dark, make text lighter
          for (let lightness = 0.9; lightness >= 0.5; lightness -= 0.05) {
            const testColor = chroma.hsl(textHue, textSat, lightness);
            if (chroma.contrast(bgColor, testColor) >= targetRatio) {
              return testColor.hex();
            }
          }
          // Fallback to muted white if colorful didn't work
          return chroma.contrast(bgColor, mutedWhite) >= targetRatio ? mutedWhite : '#ffffff';
        }
      } else {
        // Use muted black/white
        if (bgLuminance > 0.5) {
          // Light background, use muted black
          return chroma.contrast(bgColor, mutedBlack) >= targetRatio ? mutedBlack : '#000000';
        } else {
          // Dark background, use muted white
          return chroma.contrast(bgColor, mutedWhite) >= targetRatio ? mutedWhite : '#ffffff';
        }
      }
    } catch (e) {
      // If color parsing fails, return slightly muted black
      return chroma.hsl(0, 0, 0.08).hex();
    }
  };

  /**
   * Generate text color that GUARANTEES AAA (7.0:1) contrast ratio
   * @param panelColor - The background color to contrast against
   * @returns Text color with AAA contrast
   */
  const getAAATextColor = (panelColor: string): string => {
    try {
      // Try the smart colorful approach first
      let textColor = getReadableTextColor(panelColor, 7.0);
      let contrast = chroma.contrast(panelColor, textColor);

      // If it passes AAA, return it
      if (contrast >= 7.0) {
        return textColor;
      }

      // Fallback: try pure black or white
      const whiteContrast = chroma.contrast(panelColor, '#ffffff');
      const blackContrast = chroma.contrast(panelColor, '#000000');

      if (whiteContrast >= blackContrast) {
        if (whiteContrast >= 7.0) return '#ffffff';
      } else {
        if (blackContrast >= 7.0) return '#000000';
      }

      // If neither pure black nor white gives AAA, use muted versions
      // Slightly muted white and black
      const mutedWhite = chroma.hsl(0, 0, 0.95).hex(); // 95% lightness
      const mutedBlack = chroma.hsl(0, 0, 0.05).hex(); // 5% lightness

      const mutedWhiteContrast = chroma.contrast(panelColor, mutedWhite);
      const mutedBlackContrast = chroma.contrast(panelColor, mutedBlack);

      // Return whichever has better contrast (prefer the one closer to AAA)
      return mutedWhiteContrast >= mutedBlackContrast ? mutedWhite : mutedBlack;
    } catch (e) {
      // Absolute fallback
      return '#000000';
    }
  };

  const generatePaletteColors = (hue: number, saturation: number, lightness: number, harmonyType: 'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'random'): string[] => {
    let bloomColors: string[] = [];

    // Convert saturation from 0-100 to 0-1
    const baseSat = saturation / 100;
    const baseLight = lightness / 100;

    // Use base saturation without random variation
    const useSat = () => baseSat;

    // Generate lightness values around the base without random variation
    const useLight = (offset: number) => {
      return Math.max(0.1, Math.min(0.9, baseLight + offset));
    };

    switch (harmonyType) {
      case 'monochromatic':
        // Single hue with varying lightness
        bloomColors = chroma
          .scale([
            chroma.hsl(hue, useSat(), useLight(-0.2)),
            chroma.hsl(hue, useSat(), useLight(-0.1)),
            chroma.hsl(hue, useSat(), useLight(0.1)),
            chroma.hsl(hue, useSat(), useLight(0.2)),
          ])
          .mode('lch')
          .colors(4);
        break;

      case 'complementary':
        // Base hue and its complement (180° opposite)
        const complement = (hue + 180) % 360;
        bloomColors = [
          chroma.hsl(hue, useSat(), useLight(-0.15)).hex(),
          chroma.hsl(hue, useSat(), useLight(-0.05)).hex(),
          chroma.hsl(complement, useSat(), useLight(0.05)).hex(),
          chroma.hsl(complement, useSat(), useLight(0.15)).hex(),
        ];
        break;

      case 'analogous':
        // Base hue with adjacent hues (±30°)
        bloomColors = [
          chroma.hsl(hue, useSat(), useLight(-0.15)).hex(),
          chroma.hsl((hue + 30) % 360, useSat(), useLight(-0.05)).hex(),
          chroma.hsl((hue - 30 + 360) % 360, useSat(), useLight(0.05)).hex(),
          chroma.hsl(hue, useSat(), useLight(0.15)).hex(),
        ];
        break;

      case 'triadic':
        // Three colors evenly spaced (120° apart)
        const triad1 = (hue + 120) % 360;
        const triad2 = (hue + 240) % 360;
        bloomColors = [
          chroma.hsl(hue, useSat(), useLight(-0.1)).hex(),
          chroma.hsl(triad1, useSat(), useLight(0)).hex(),
          chroma.hsl(triad2, useSat(), useLight(0.05)).hex(),
          chroma.hsl(hue, useSat(), useLight(0.15)).hex(),
        ];
        break;

      case 'split-complementary':
        // Base hue with two colors adjacent to complement
        const splitComp1 = (hue + 150) % 360;
        const splitComp2 = (hue + 210) % 360;
        bloomColors = [
          chroma.hsl(hue, useSat(), useLight(-0.15)).hex(),
          chroma.hsl(hue, useSat(), useLight(-0.05)).hex(),
          chroma.hsl(splitComp1, useSat(), useLight(0.05)).hex(),
          chroma.hsl(splitComp2, useSat(), useLight(0.15)).hex(),
        ];
        break;

      case 'random':
        // Utterly random - generate 4 completely independent colors
        // Use timestamp + index to ensure different seeds
        const now = Date.now();
        bloomColors = Array.from({ length: 4 }, (_, i) => {
          // Create pseudo-random values using different offsets
          const seed = (now + i * 1234567) % 360;
          const hueRandom = (seed * 9301 + 49297) % 360;
          const satRandom = ((seed * 7919 + 11317) % 80) / 100 + 0.2;
          const lightRandom = ((seed * 5953 + 23459) % 70) / 100 + 0.15;

          return chroma.hsl(hueRandom, satRandom, lightRandom).hex();
        });
        break;
    }

    return bloomColors;
  };

  const handleGenerateUIColors = () => {
    // Use the preview palette colors (what the user sees) instead of regenerating
    const bloomColors = previewPalette.length > 0
      ? previewPalette
      : generatePaletteColors(baseHue, baseSaturation, baseLightness, selectedHarmony);

    // Shuffle bloom colors for variety when applying (but keep preview in harmony order)
    const shuffled = [...bloomColors].sort(() => Math.random() - 0.5);

    // Pick a random bloom color to derive UI colors from
    const selectedBloomColor = shuffled[Math.floor(Math.random() * 4)];

    // Generate bloom border color (same for both modes)
    let bloomBorderColor: string;
    if (Math.random() < 0.25) {
      bloomBorderColor = '#000000';
    } else {
      const borderBaseColor = chroma(shuffled[Math.floor(Math.random() * 4)]);
      bloomBorderColor = borderBaseColor.darken(0.5 + Math.random() * 0.5).hex();
    }

    // Helper to preserve gradient/solid type when updating color
    const updateColorValue = (currentColor: ColorValue, newColor: string): ColorValue => {
      if (currentColor.type === 'gradient') {
        // Preserve gradient structure, just update the colors
        const baseChroma = chroma(newColor);
        const color1 = baseChroma.brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = baseChroma.darken(0.3 + Math.random() * 0.3).hex();
        return {
          type: 'gradient',
          value: {
            ...currentColor.value,
            stops: [
              { color: color1, offset: '0%' },
              { color: color2, offset: '100%' },
            ],
          },
        };
      }
      return { type: 'solid', value: newColor };
    };

    // Generate LIGHT mode UI colors
    // Randomly pick different colors for background/panel/border (30% chance each)
    const lightBgColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : selectedBloomColor;
    const lightPanelColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : lightBgColor;
    const lightBorderColorBase = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : lightPanelColor;

    const lightBgChroma = chroma(lightBgColor);
    const lightPanelChroma = chroma(lightPanelColor);
    const lightBorderChroma = chroma(lightBorderColorBase);

    const lightBgHue = lightBgChroma.get('hsl.h');
    const lightBgSat = lightBgChroma.get('hsl.s');
    const lightPanelHue = lightPanelChroma.get('hsl.h');
    const lightPanelSat = lightPanelChroma.get('hsl.s');
    const lightBorderHue = lightBorderChroma.get('hsl.h');
    const lightBorderSat = lightBorderChroma.get('hsl.s');

    const lightBackground = chroma.hsl(lightBgHue, lightBgSat, 0.6 + Math.random() * 0.4).hex();
    const lightPanel = Math.random() < 0.4 ? lightBackground : chroma.hsl(lightPanelHue, lightPanelSat, 0.6 + Math.random() * 0.4).hex();
    const lightTextColor = getAAATextColor(lightPanel);
    const lightBorderColor = chroma.hsl(lightBorderHue, lightBorderSat === 0 ? 0 : Math.min(1, lightBorderSat + 0.1), 0.75 + Math.random() * 0.15).hex();

    // Generate DARK mode UI colors
    // Randomly pick different colors for background/panel/border (30% chance each)
    const darkBgColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : selectedBloomColor;
    const darkPanelColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : darkBgColor;
    const darkBorderColorBase = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : darkPanelColor;

    const darkBgChroma = chroma(darkBgColor);
    const darkPanelChroma = chroma(darkPanelColor);
    const darkBorderChroma = chroma(darkBorderColorBase);

    const darkBgHue = darkBgChroma.get('hsl.h');
    const darkBgSat = darkBgChroma.get('hsl.s');
    const darkPanelHue = darkPanelChroma.get('hsl.h');
    const darkPanelSat = darkPanelChroma.get('hsl.s');
    const darkBorderHue = darkBorderChroma.get('hsl.h');
    const darkBorderSat = darkBorderChroma.get('hsl.s');

    const darkBackground = chroma.hsl(darkBgHue, darkBgSat, Math.random() * 0.4).hex();
    const darkPanel = Math.random() < 0.4 ? darkBackground : chroma.hsl(darkPanelHue, darkPanelSat, Math.random() * 0.4).hex();
    const darkTextColor = getAAATextColor(darkPanel);
    const darkBorderColor = chroma.hsl(darkBorderHue, darkBorderSat === 0 ? 0 : Math.min(1, darkBorderSat + 0.1), 0.2 + Math.random() * 0.15).hex();

    // Generate control colors based on the selected bloom color
    const controlChroma = chroma(selectedBloomColor);
    const controlHue = controlChroma.get('hsl.h');
    const controlSat = controlChroma.get('hsl.s');

    // Helper for button gradient
    const maybeButtonGradient = (baseColor: string): ColorValue => {
      if (Math.random() < 0.25) {
        const angle = Math.floor(Math.random() * 360);
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();
        return {
          type: 'gradient',
          value: {
            id: `button-gradient-${Date.now()}`,
            stops: [
              { color: color1, offset: '0%' },
              { color: color2, offset: '100%' },
            ],
            angle,
          },
        };
      }
      return { type: 'solid', value: baseColor };
    };

    // Light mode controls
    const lightButtonBgColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.5 + Math.random() * 0.2).hex();
    const lightButtonBg = maybeButtonGradient(lightButtonBgColor);
    const lightButtonText = getAAATextColor(lightButtonBgColor);
    const lightButtonBorder = Math.random() < 0.3
      ? lightButtonBgColor
      : chroma(lightButtonBgColor).darken(0.5 + Math.random() * 0.5).hex();
    const lightLinkColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.2), 0.35 + Math.random() * 0.15).hex();
    const lightSelectionColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.70 + Math.random() * 0.15).hex();

    // Dark mode controls
    const darkButtonBgColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.4 + Math.random() * 0.2).hex();
    const darkButtonBg = maybeButtonGradient(darkButtonBgColor);
    const darkButtonText = getAAATextColor(darkButtonBgColor);
    const darkButtonBorder = Math.random() < 0.3
      ? darkButtonBgColor
      : chroma(darkButtonBgColor).brighten(0.5 + Math.random() * 0.5).hex();
    const darkLinkColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.2), 0.55 + Math.random() * 0.15).hex();
    const darkSelectionColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.45 + Math.random() * 0.15).hex();

    // Apply palette and control COLORS only (no styling changes)
    if (updateBothModesPalette) {
      // Update both modes
      setFormData((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          primaryColor: updateColorValue(prev.light.primaryColor, shuffled[0]),
          secondaryColor: updateColorValue(prev.light.secondaryColor, shuffled[1]),
          tertiaryColor: updateColorValue(prev.light.tertiaryColor, shuffled[2]),
          quaternaryColor: updateColorValue(prev.light.quaternaryColor, shuffled[3]),
          bloomBorderColor,
          backgroundColor: lightBackground,
          panelColor: lightPanel,
          textColor: lightTextColor,
          borderColor: lightBorderColor,
          buttonBackgroundColor: lightButtonBg,
          buttonTextColor: lightButtonText,
          buttonBorderColor: lightButtonBorder,
          linkColor: lightLinkColor,
          selectionColor: lightSelectionColor,
        },
        dark: {
          ...prev.dark,
          primaryColor: updateColorValue(prev.dark.primaryColor, shuffled[0]),
          secondaryColor: updateColorValue(prev.dark.secondaryColor, shuffled[1]),
          tertiaryColor: updateColorValue(prev.dark.tertiaryColor, shuffled[2]),
          quaternaryColor: updateColorValue(prev.dark.quaternaryColor, shuffled[3]),
          bloomBorderColor,
          backgroundColor: darkBackground,
          panelColor: darkPanel,
          textColor: darkTextColor,
          borderColor: darkBorderColor,
          buttonBackgroundColor: darkButtonBg,
          buttonTextColor: darkButtonText,
          buttonBorderColor: darkButtonBorder,
          linkColor: darkLinkColor,
          selectionColor: darkSelectionColor,
        },
      }));
    } else {
      // Update only active mode
      const activeMode = formData.activeMode;
      const paletteData = activeMode === 'light' ? {
        primaryColor: updateColorValue(formData.light.primaryColor, shuffled[0]),
        secondaryColor: updateColorValue(formData.light.secondaryColor, shuffled[1]),
        tertiaryColor: updateColorValue(formData.light.tertiaryColor, shuffled[2]),
        quaternaryColor: updateColorValue(formData.light.quaternaryColor, shuffled[3]),
        bloomBorderColor,
        backgroundColor: lightBackground,
        panelColor: lightPanel,
        textColor: lightTextColor,
        borderColor: lightBorderColor,
        buttonBackgroundColor: lightButtonBg,
        buttonTextColor: lightButtonText,
        buttonBorderColor: lightButtonBorder,
        linkColor: lightLinkColor,
        selectionColor: lightSelectionColor,
      } : {
        primaryColor: updateColorValue(formData.dark.primaryColor, shuffled[0]),
        secondaryColor: updateColorValue(formData.dark.secondaryColor, shuffled[1]),
        tertiaryColor: updateColorValue(formData.dark.tertiaryColor, shuffled[2]),
        quaternaryColor: updateColorValue(formData.dark.quaternaryColor, shuffled[3]),
        bloomBorderColor,
        backgroundColor: darkBackground,
        panelColor: darkPanel,
        textColor: darkTextColor,
        borderColor: darkBorderColor,
        buttonBackgroundColor: darkButtonBg,
        buttonTextColor: darkButtonText,
        buttonBorderColor: darkButtonBorder,
        linkColor: darkLinkColor,
        selectionColor: darkSelectionColor,
      };

      setFormData((prev) => ({
        ...prev,
        [activeMode]: {
          ...prev[activeMode],
          ...paletteData,
        },
      }));
    }
  };

  const handleRandomize = () => {
    // 15% chance of black and white palette
    const isBlackAndWhite = Math.random() < 0.15;

    if (isBlackAndWhite) {
      // Black and white palette - zero saturation
      setBaseHue(0);
      setBaseSaturation(0);
      setBaseLightness(50);
      setSelectedHarmony('monochromatic');
    } else {
      // Colorful palette
      // Generate random base hue
      const randomHue = Math.random() * 360;
      setBaseHue(randomHue);

      // Generate random saturation (40-90%)
      const randomSat = 40 + Math.random() * 50;
      setBaseSaturation(randomSat);

      // Generate random lightness (30-70%)
      const randomLight = 30 + Math.random() * 40;
      setBaseLightness(randomLight);

      // Randomly select a color harmony type
      const harmonyTypes: Array<'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'random'> = ['monochromatic', 'complementary', 'analogous', 'triadic', 'split-complementary', 'random'];
      const randomHarmony = harmonyTypes[Math.floor(Math.random() * harmonyTypes.length)];
      setSelectedHarmony(randomHarmony);
    }

    // Note: Preview palette will auto-update via useEffect
    // This randomize button will update sliders but not apply the palette
  };

  // Helper to clone a ColorValue with a new ID (for duplicating between light/dark modes)
  const cloneColorValueWithNewId = (color: ColorValue, mode: 'light' | 'dark', index: number): ColorValue => {
    if (color.type === 'gradient') {
      return {
        type: 'gradient',
        value: {
          ...color.value,
          id: `bloom-gradient-${mode}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
      };
    }
    return color; // Solid colors don't need cloning
  };

  const randomizeBloom = () => {
    // Get bloom colors from each mode's palette (not just active mode)
    const lightBloomColors = [
      getBloomColor(formData.light.primaryColor),
      getBloomColor(formData.light.secondaryColor),
      getBloomColor(formData.light.tertiaryColor),
      getBloomColor(formData.light.quaternaryColor),
    ];
    const darkBloomColors = [
      getBloomColor(formData.dark.primaryColor),
      getBloomColor(formData.dark.secondaryColor),
      getBloomColor(formData.dark.tertiaryColor),
      getBloomColor(formData.dark.quaternaryColor),
    ];

    // Use active mode's colors if only updating one mode
    const activeBloomColors = formData.activeMode === 'light' ? lightBloomColors : darkBloomColors;
    const shuffled = updateBothModesBloom
      ? [...activeBloomColors].sort(() => Math.random() - 0.5) // Will be overridden below
      : [...activeBloomColors].sort(() => Math.random() - 0.5);

    // Helper to maybe create a gradient (25% chance)
    const maybeGradient = (baseColor: string, index: number, mode: 'light' | 'dark'): ColorValue => {
      if (Math.random() < 0.25) {
        // Create a gradient with 2 stops
        const angle = Math.floor(Math.random() * 360);

        // Vary the base color slightly for gradient stops
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();

        return {
          type: 'gradient',
          value: {
            id: `bloom-gradient-${mode}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            stops: [
              { color: color1, offset: '0%' },
              { color: color2, offset: '100%' },
            ],
            angle,
          },
        };
      }
      return { type: 'solid', value: baseColor };
    };

    // Generate shared styling (same for both modes)
    // Randomize border width (0-40, with bias toward 0)
    const bloomBorderWidth = Math.random() < 0.3 ? '0' : Math.floor(Math.random() * 41).toString();

    // Randomize shadow (50% chance to enable)
    const bloomShadowEnabled = Math.random() < 0.5;
    const bloomShadowColor = '#000000';
    // 20% chance for cartoon shadow (solid, no blur)
    const isCartoonShadow = Math.random() < 0.2;
    const bloomShadowOffsetX = Math.floor(Math.random() * 13).toString(); // 0-12px
    const bloomShadowOffsetY = Math.floor(Math.random() * 13).toString(); // 0-12px
    const bloomShadowBlurRadius = isCartoonShadow ? '0' : Math.floor(Math.random() * 21).toString(); // 0-20px or forced 0 for cartoon
    const bloomShadowOpacity = isCartoonShadow ? '0.95' : (0.2 + Math.random() * 0.5).toFixed(2); // 0.95 for cartoon, 0.2-0.7 otherwise (more visible)

    // Helper to generate border color from a palette
    const generateBorderColor = (paletteColors: string[]) => {
      if (Math.random() < 0.25) {
        return '#000000';
      } else {
        const borderBaseColor = chroma(paletteColors[Math.floor(Math.random() * 4)]);
        return borderBaseColor.darken(0.5 + Math.random() * 0.5).hex();
      }
    };

    // Generate bloom data for light mode (using light mode's palette)
    const lightShuffled = [...lightBloomColors].sort(() => Math.random() - 0.5);
    const lightBloomData = {
      primaryColor: maybeGradient(lightShuffled[0], 0, 'light'),
      secondaryColor: maybeGradient(lightShuffled[1], 1, 'light'),
      tertiaryColor: maybeGradient(lightShuffled[2], 2, 'light'),
      quaternaryColor: maybeGradient(lightShuffled[3], 3, 'light'),
      bloomBorderColor: generateBorderColor(lightBloomColors),
      bloomBorderWidth,
      bloomShadowEnabled,
      bloomShadowColor,
      bloomShadowOffsetX,
      bloomShadowOffsetY,
      bloomShadowBlurRadius,
      bloomShadowOpacity,
    };

    // Generate bloom data for dark mode (using dark mode's palette)
    const darkShuffled = [...darkBloomColors].sort(() => Math.random() - 0.5);
    const darkBloomData = {
      primaryColor: maybeGradient(darkShuffled[0], 0, 'dark'),
      secondaryColor: maybeGradient(darkShuffled[1], 1, 'dark'),
      tertiaryColor: maybeGradient(darkShuffled[2], 2, 'dark'),
      quaternaryColor: maybeGradient(darkShuffled[3], 3, 'dark'),
      bloomBorderColor: generateBorderColor(darkBloomColors),
      bloomBorderWidth,
      bloomShadowEnabled,
      bloomShadowColor,
      bloomShadowOffsetX,
      bloomShadowOffsetY,
      bloomShadowBlurRadius,
      bloomShadowOpacity,
    };

    if (updateBothModesBloom) {
      // Update both modes
      setFormData((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          ...lightBloomData,
        },
        dark: {
          ...prev.dark,
          ...darkBloomData,
        },
      }));
    } else {
      // Update only active mode
      setFormData((prev) => ({
        ...prev,
        [prev.activeMode]: {
          ...prev[prev.activeMode],
          ...(prev.activeMode === 'light' ? lightBloomData : darkBloomData),
        },
      }));
    }
  };

  /**
   * Handle clicking a palette preview color to edit it
   */
  const handlePaletteColorClick = (index: number) => {
    const colors = previewPalette.length > 0
      ? previewPalette
      : [
          getBloomColor(formData[formData.activeMode].primaryColor),
          getBloomColor(formData[formData.activeMode].secondaryColor),
          getBloomColor(formData[formData.activeMode].tertiaryColor),
          getBloomColor(formData[formData.activeMode].quaternaryColor),
        ];
    setEditingPaletteIndex(index);
    setEditingPaletteColor(colors[index]);
  };

  /**
   * Handle saving the edited palette color
   */
  const handleSavePaletteColor = () => {
    if (editingPaletteIndex === null) return;

    // Validate hex color
    if (!/^#[0-9A-Fa-f]{6}$/.test(editingPaletteColor)) {
      alert('Please enter a valid hex color (e.g., #ff0000)');
      return;
    }

    // Update preview palette
    const colors = previewPalette.length > 0
      ? [...previewPalette]
      : [
          getBloomColor(formData[formData.activeMode].primaryColor),
          getBloomColor(formData[formData.activeMode].secondaryColor),
          getBloomColor(formData[formData.activeMode].tertiaryColor),
          getBloomColor(formData[formData.activeMode].quaternaryColor),
        ];

    colors[editingPaletteIndex] = editingPaletteColor;
    setPreviewPalette(colors);

    // Close editor
    setEditingPaletteIndex(null);
    setEditingPaletteColor('#000000');
  };

  /**
   * Handle canceling palette color edit
   */
  const handleCancelPaletteEdit = () => {
    setEditingPaletteIndex(null);
    setEditingPaletteColor('#000000');
  };

  const randomizeDetails = () => {
    // Generate weird but readable title (2-3 words)
    const titlePatterns = [
      () => `${faker.word.adjective()} ${faker.word.noun()}`,
      () => `${faker.word.adjective()} ${faker.word.adjective()} ${faker.word.noun()}`,
      () => `${faker.word.noun()} ${faker.word.preposition()} ${faker.word.noun()}`,
      () => `${faker.word.verb()} ${faker.word.noun()}`,
    ];
    const randomTitle = titlePatterns[Math.floor(Math.random() * titlePatterns.length)]();

    // Capitalize first letter of each word
    const title = randomTitle
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Generate weird but readable description (nonsensical sentence)
    const descriptionPatterns = [
      () => `${faker.word.adjective()} ${faker.word.noun()} ${faker.word.verb()} ${faker.word.adverb()} ${faker.word.preposition()} ${faker.word.noun()}`,
      () => `${faker.word.verb()} the ${faker.word.adjective()} ${faker.word.noun()} ${faker.word.preposition()} ${faker.word.noun()}`,
      () => `${faker.word.adjective()} ${faker.word.noun()} and ${faker.word.adjective()} ${faker.word.noun()} ${faker.word.verb()} together`,
      () => `where ${faker.word.noun()} meets ${faker.word.noun()} in ${faker.word.adjective()} harmony`,
      () => `${faker.word.adverb()} ${faker.word.verb()} through ${faker.word.adjective()} ${faker.word.noun()}`,
    ];
    const randomDescription = descriptionPatterns[Math.floor(Math.random() * descriptionPatterns.length)]();

    // Capitalize first letter
    const description = randomDescription.charAt(0).toUpperCase() + randomDescription.slice(1);

    setFormData({
      ...formData,
      title,
      description,
    });
  };

  const randomizeStyle = () => {
    // Get bloom colors from each mode's palette
    const lightBloomColors = [
      getBloomColor(formData.light.primaryColor),
      getBloomColor(formData.light.secondaryColor),
      getBloomColor(formData.light.tertiaryColor),
      getBloomColor(formData.light.quaternaryColor),
    ];
    const darkBloomColors = [
      getBloomColor(formData.dark.primaryColor),
      getBloomColor(formData.dark.secondaryColor),
      getBloomColor(formData.dark.tertiaryColor),
      getBloomColor(formData.dark.quaternaryColor),
    ];

    const selectedLightBloomColor = lightBloomColors[Math.floor(Math.random() * 4)];
    const selectedDarkBloomColor = darkBloomColors[Math.floor(Math.random() * 4)];

    // Generate shared styling (same for both modes)
    const fonts = ['sans-serif', 'serif', 'monospace'];
    const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
    const borderStyles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const randomBorderStyle = borderStyles[Math.floor(Math.random() * borderStyles.length)];
    const borderWidth = Math.floor(Math.random() * 6).toString();
    const borderRadius = Math.floor(Math.random() * 31).toString();

    // Generate LIGHT mode (using light mode's palette)
    // Randomly pick different colors for background/panel/border (30% chance each)
    const lightBgColor = Math.random() < 0.3 ? lightBloomColors[Math.floor(Math.random() * 4)] : selectedLightBloomColor;
    const lightPanelColor = Math.random() < 0.3 ? lightBloomColors[Math.floor(Math.random() * 4)] : lightBgColor;
    const lightBorderColorBase = Math.random() < 0.3 ? lightBloomColors[Math.floor(Math.random() * 4)] : lightPanelColor;

    const lightBgChroma = chroma(lightBgColor);
    const lightPanelChroma = chroma(lightPanelColor);
    const lightBorderChroma = chroma(lightBorderColorBase);

    const lightBgHue = lightBgChroma.get('hsl.h');
    const lightBgSat = lightBgChroma.get('hsl.s');
    const lightPanelHue = lightPanelChroma.get('hsl.h');
    const lightPanelSat = lightPanelChroma.get('hsl.s');
    const lightBorderHue = lightBorderChroma.get('hsl.h');
    const lightBorderSat = lightBorderChroma.get('hsl.s');

    const lightBackground = chroma.hsl(lightBgHue, lightBgSat, 0.6 + Math.random() * 0.4).hex();
    const lightPanel = Math.random() < 0.4 ? lightBackground : chroma.hsl(lightPanelHue, lightPanelSat, 0.6 + Math.random() * 0.4).hex();
    const lightTextColor = getAAATextColor(lightPanel);
    const lightBorderColor = chroma.hsl(lightBorderHue, lightBorderSat === 0 ? 0 : Math.min(1, lightBorderSat + 0.1), 0.76 + Math.random() * 0.08).hex();

    // Generate DARK mode (using dark mode's palette)
    // Randomly pick different colors for background/panel/border (30% chance each)
    const darkBgColor = Math.random() < 0.3 ? darkBloomColors[Math.floor(Math.random() * 4)] : selectedDarkBloomColor;
    const darkPanelColor = Math.random() < 0.3 ? darkBloomColors[Math.floor(Math.random() * 4)] : darkBgColor;
    const darkBorderColorBase = Math.random() < 0.3 ? darkBloomColors[Math.floor(Math.random() * 4)] : darkPanelColor;

    const darkBgChroma = chroma(darkBgColor);
    const darkPanelChroma = chroma(darkPanelColor);
    const darkBorderChroma = chroma(darkBorderColorBase);

    const darkBgHue = darkBgChroma.get('hsl.h');
    const darkBgSat = darkBgChroma.get('hsl.s');
    const darkPanelHue = darkPanelChroma.get('hsl.h');
    const darkPanelSat = darkPanelChroma.get('hsl.s');
    const darkBorderHue = darkBorderChroma.get('hsl.h');
    const darkBorderSat = darkBorderChroma.get('hsl.s');

    const darkBackground = chroma.hsl(darkBgHue, darkBgSat, Math.random() * 0.4).hex();
    const darkPanel = Math.random() < 0.4 ? darkBackground : chroma.hsl(darkPanelHue, darkPanelSat, Math.random() * 0.4).hex();
    const darkTextColor = getAAATextColor(darkPanel);
    const darkBorderColor = chroma.hsl(darkBorderHue, darkBorderSat === 0 ? 0 : Math.min(1, darkBorderSat + 0.1), 0.16 + Math.random() * 0.08).hex();

    // Randomize panel shadow (15% chance to enable)
    const panelShadowEnabled = Math.random() < 0.15;
    const panelShadowColor = '#000000';
    const isPanelCartoonShadow = Math.random() < 0.1; // 10% chance for cartoon shadow
    const panelShadowOffsetX = Math.floor(Math.random() * 11).toString(); // 0-10px
    const panelShadowOffsetY = Math.floor(Math.random() * 11).toString(); // 0-10px
    const panelShadowBlurRadius = isPanelCartoonShadow ? '0' : Math.floor(Math.random() * 21).toString(); // 0 for cartoon, 0-20px otherwise
    const panelShadowOpacity = isPanelCartoonShadow ? '0.95' : (0.1 + Math.random() * 0.35).toFixed(2); // 0.95 for cartoon, 0.1-0.45 otherwise

    // Update style/content only (NOT controls)
    if (updateBothModesStyle) {
      // Update both modes
      setFormData((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          borderWidth,
          borderRadius,
          borderStyle: randomBorderStyle,
          borderColor: lightBorderColor,
          backgroundColor: lightBackground,
          panelColor: lightPanel,
          textColor: lightTextColor,
          font: randomFont,
          panelShadowEnabled,
          panelShadowColor,
          panelShadowOffsetX,
          panelShadowOffsetY,
          panelShadowBlurRadius,
          panelShadowOpacity,
        },
        dark: {
          ...prev.dark,
          borderWidth,
          borderRadius,
          borderStyle: randomBorderStyle,
          borderColor: darkBorderColor,
          backgroundColor: darkBackground,
          panelColor: darkPanel,
          textColor: darkTextColor,
          font: randomFont,
          panelShadowEnabled,
          panelShadowColor,
          panelShadowOffsetX,
          panelShadowOffsetY,
          panelShadowBlurRadius,
          panelShadowOpacity,
        },
      }));
    } else {
      // Update only active mode
      const activeMode = formData.activeMode;
      const styleData = activeMode === 'light' ? {
        borderWidth,
        borderRadius,
        borderStyle: randomBorderStyle,
        borderColor: lightBorderColor,
        backgroundColor: lightBackground,
        panelColor: lightPanel,
        textColor: lightTextColor,
        font: randomFont,
        panelShadowEnabled,
        panelShadowColor,
        panelShadowOffsetX,
        panelShadowOffsetY,
        panelShadowBlurRadius,
        panelShadowOpacity,
      } : {
        borderWidth,
        borderRadius,
        borderStyle: randomBorderStyle,
        borderColor: darkBorderColor,
        backgroundColor: darkBackground,
        panelColor: darkPanel,
        textColor: darkTextColor,
        font: randomFont,
        panelShadowEnabled,
        panelShadowColor,
        panelShadowOffsetX,
        panelShadowOffsetY,
        panelShadowBlurRadius,
        panelShadowOpacity,
      };

      setFormData((prev) => ({
        ...prev,
        [activeMode]: {
          ...prev[activeMode],
          ...styleData,
        },
      }));
    }
  };

  const randomizeControls = () => {
    // Get bloom colors from each mode's palette
    const lightBloomColors = [
      getBloomColor(formData.light.primaryColor),
      getBloomColor(formData.light.secondaryColor),
      getBloomColor(formData.light.tertiaryColor),
      getBloomColor(formData.light.quaternaryColor),
    ];
    const darkBloomColors = [
      getBloomColor(formData.dark.primaryColor),
      getBloomColor(formData.dark.secondaryColor),
      getBloomColor(formData.dark.tertiaryColor),
      getBloomColor(formData.dark.quaternaryColor),
    ];

    // Select random colors from each mode's palette
    const selectedLightBloomColor = lightBloomColors[Math.floor(Math.random() * 4)];
    const selectedDarkBloomColor = darkBloomColors[Math.floor(Math.random() * 4)];

    // Extract HSL from the selected bloom colors
    const lightBloomChroma = chroma(selectedLightBloomColor);
    const lightControlHue = lightBloomChroma.get('hsl.h');
    const lightControlSat = lightBloomChroma.get('hsl.s');

    const darkBloomChroma = chroma(selectedDarkBloomColor);
    const darkControlHue = darkBloomChroma.get('hsl.h');
    const darkControlSat = darkBloomChroma.get('hsl.s');

    // Helper to maybe create a gradient for button (25% chance)
    const maybeButtonGradient = (baseColor: string): ColorValue => {
      if (Math.random() < 0.25) {
        // Create a gradient with 2 stops
        const angle = Math.floor(Math.random() * 360);
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();

        return {
          type: 'gradient',
          value: {
            id: `button-gradient-${Date.now()}`,
            stops: [
              { color: color1, offset: '0%' },
              { color: color2, offset: '100%' },
            ],
            angle,
          },
        };
      }
      return { type: 'solid', value: baseColor };
    };

    // Generate button colors for LIGHT mode (using light mode's palette)
    const lightButtonBgColor = chroma.hsl(lightControlHue, Math.min(1, lightControlSat + 0.1), 0.5 + Math.random() * 0.2).hex();
    const lightButtonBg = maybeButtonGradient(lightButtonBgColor);
    const lightButtonText = getAAATextColor(lightButtonBgColor);
    const lightButtonBorder = Math.random() < 0.3
      ? lightButtonBgColor
      : chroma(lightButtonBgColor).darken(0.5 + Math.random() * 0.5).hex();
    const lightLinkColor = chroma.hsl(lightControlHue, Math.min(1, lightControlSat + 0.2), 0.35 + Math.random() * 0.15).hex();
    const lightSelectionColor = chroma.hsl(lightControlHue, Math.min(1, lightControlSat + 0.1), 0.70 + Math.random() * 0.15).hex();

    // Generate button colors for DARK mode (using dark mode's palette)
    const darkButtonBgColor = chroma.hsl(darkControlHue, Math.min(1, darkControlSat + 0.1), 0.4 + Math.random() * 0.2).hex();
    const darkButtonBg = maybeButtonGradient(darkButtonBgColor);
    const darkButtonText = getAAATextColor(darkButtonBgColor);
    const darkButtonBorder = Math.random() < 0.3
      ? darkButtonBgColor
      : chroma(darkButtonBgColor).brighten(0.5 + Math.random() * 0.5).hex();
    const darkLinkColor = chroma.hsl(darkControlHue, Math.min(1, darkControlSat + 0.2), 0.55 + Math.random() * 0.15).hex();
    const darkSelectionColor = chroma.hsl(darkControlHue, Math.min(1, darkControlSat + 0.1), 0.45 + Math.random() * 0.15).hex();

    // Shared button styling
    const buttonBorderWidth = Math.floor(Math.random() * 4).toString();
    const borderStyles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const buttonBorderStyle = borderStyles[Math.floor(Math.random() * borderStyles.length)];
    // Button border radius: 0-50px, with higher values creating pill-shaped buttons
    const buttonBorderRadius = Math.floor(Math.random() * 51).toString();

    // Shared link styling
    const underlineStyles: Array<'none' | 'underline' | 'always'> = ['none', 'underline', 'always'];
    const linkUnderlineStyle = underlineStyles[Math.floor(Math.random() * underlineStyles.length)];

    // Randomize button shadow (25% chance to enable)
    const buttonShadowEnabled = Math.random() < 0.25;
    const buttonShadowColor = '#000000';
    const isButtonCartoonShadow = Math.random() < 0.1; // 10% chance for cartoon shadow
    const buttonShadowOffsetX = Math.floor(Math.random() * 11).toString(); // 0-10px
    const buttonShadowOffsetY = Math.floor(Math.random() * 11).toString(); // 0-10px
    const buttonShadowBlurRadius = isButtonCartoonShadow ? '0' : Math.floor(Math.random() * 21).toString(); // 0 for cartoon, 0-20px otherwise
    const buttonShadowOpacity = isButtonCartoonShadow ? '0.95' : (0.1 + Math.random() * 0.35).toFixed(2); // 0.95 for cartoon, 0.1-0.45 otherwise

    if (updateBothModesControls) {
      // Update both modes
      setFormData((prev) => ({
        ...prev,
        light: {
          ...prev.light,
          buttonBackgroundColor: lightButtonBg,
          buttonTextColor: lightButtonText,
          buttonBorderColor: lightButtonBorder,
          buttonBorderWidth,
          buttonBorderStyle,
          buttonBorderRadius,
          buttonShadowEnabled,
          buttonShadowColor,
          buttonShadowOffsetX,
          buttonShadowOffsetY,
          buttonShadowBlurRadius,
          buttonShadowOpacity,
          linkColor: lightLinkColor,
          linkUnderlineStyle,
          selectionColor: lightSelectionColor,
        },
        dark: {
          ...prev.dark,
          buttonBackgroundColor: darkButtonBg,
          buttonTextColor: darkButtonText,
          buttonBorderColor: darkButtonBorder,
          buttonBorderWidth,
          buttonBorderStyle,
          buttonBorderRadius,
          buttonShadowEnabled,
          buttonShadowColor,
          buttonShadowOffsetX,
          buttonShadowOffsetY,
          buttonShadowBlurRadius,
          buttonShadowOpacity,
          linkColor: darkLinkColor,
          linkUnderlineStyle,
          selectionColor: darkSelectionColor,
        },
      }));
    } else {
      // Update only active mode
      const activeMode = formData.activeMode;
      const controlData = activeMode === 'light' ? {
        buttonBackgroundColor: lightButtonBg,
        buttonTextColor: lightButtonText,
        buttonBorderColor: lightButtonBorder,
        buttonBorderWidth,
        buttonBorderStyle,
        buttonBorderRadius,
        buttonShadowEnabled,
        buttonShadowColor,
        buttonShadowOffsetX,
        buttonShadowOffsetY,
        buttonShadowBlurRadius,
        buttonShadowOpacity,
        linkColor: lightLinkColor,
        linkUnderlineStyle,
        selectionColor: lightSelectionColor,
      } : {
        buttonBackgroundColor: darkButtonBg,
        buttonTextColor: darkButtonText,
        buttonBorderColor: darkButtonBorder,
        buttonBorderWidth,
        buttonBorderStyle,
        buttonBorderRadius,
        buttonShadowEnabled,
        buttonShadowColor,
        buttonShadowOffsetX,
        buttonShadowOffsetY,
        buttonShadowBlurRadius,
        buttonShadowOpacity,
        linkColor: darkLinkColor,
        linkUnderlineStyle,
        selectionColor: darkSelectionColor,
      };

      setFormData((prev) => ({
        ...prev,
        [activeMode]: {
          ...prev[activeMode],
          ...controlData,
        },
      }));
    }
  };

  const randomizeAll = () => {
    // 15% chance of black and white theme
    const isBlackAndWhite = Math.random() < 0.15;

    let randomHue: number;
    let randomSat: number;
    let randomLight: number;
    let randomHarmony: 'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'random';

    if (isBlackAndWhite) {
      // Black and white theme - zero saturation
      randomHue = 0;
      randomSat = 0;
      randomLight = 50;
      randomHarmony = 'monochromatic';
    } else {
      // Colorful theme
      randomHue = Math.random() * 360;
      randomSat = 40 + Math.random() * 50;
      randomLight = 30 + Math.random() * 40;

      const harmonyTypes: Array<'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'random'> = ['monochromatic', 'complementary', 'analogous', 'triadic', 'split-complementary', 'random'];
      randomHarmony = harmonyTypes[Math.floor(Math.random() * harmonyTypes.length)];
    }

    setBaseHue(randomHue);
    setBaseSaturation(randomSat);
    setBaseLightness(randomLight);
    setSelectedHarmony(randomHarmony);

    const bloomColors = generatePaletteColors(randomHue, randomSat, randomLight, randomHarmony);
    const shuffled = [...bloomColors].sort(() => Math.random() - 0.5);

    // Update preview palette (keep in harmony order, not shuffled)
    setPreviewPalette(bloomColors);

    // Pick a random shuffled bloom color to derive UI colors from
    const selectedBloomColor = shuffled[Math.floor(Math.random() * 4)];

    // Generate LIGHT mode UI colors
    // Randomly pick different colors for background/panel/border (30% chance each)
    const lightBgColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : selectedBloomColor;
    const lightPanelColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : lightBgColor;
    const lightBorderColorBase = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : lightPanelColor;

    const lightBgChroma = chroma(lightBgColor);
    const lightPanelChroma = chroma(lightPanelColor);
    const lightBorderChroma = chroma(lightBorderColorBase);

    const lightBgHue = lightBgChroma.get('hsl.h');
    const lightBgSat = lightBgChroma.get('hsl.s');
    const lightPanelHue = lightPanelChroma.get('hsl.h');
    const lightPanelSat = lightPanelChroma.get('hsl.s');
    const lightBorderHue = lightBorderChroma.get('hsl.h');
    const lightBorderSat = lightBorderChroma.get('hsl.s');

    const lightBackground = chroma.hsl(lightBgHue, lightBgSat, 0.6 + Math.random() * 0.4).hex();
    const lightPanel = Math.random() < 0.4 ? lightBackground : chroma.hsl(lightPanelHue, lightPanelSat, 0.6 + Math.random() * 0.4).hex();
    const lightTextColor = getAAATextColor(lightPanel);
    const lightBorderColor = chroma.hsl(lightBorderHue, lightBorderSat === 0 ? 0 : Math.min(1, lightBorderSat + 0.1), 0.75 + Math.random() * 0.15).hex();

    // Generate DARK mode UI colors
    // Randomly pick different colors for background/panel/border (30% chance each)
    const darkBgColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : selectedBloomColor;
    const darkPanelColor = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : darkBgColor;
    const darkBorderColorBase = Math.random() < 0.3 ? shuffled[Math.floor(Math.random() * 4)] : darkPanelColor;

    const darkBgChroma = chroma(darkBgColor);
    const darkPanelChroma = chroma(darkPanelColor);
    const darkBorderChroma = chroma(darkBorderColorBase);

    const darkBgHue = darkBgChroma.get('hsl.h');
    const darkBgSat = darkBgChroma.get('hsl.s');
    const darkPanelHue = darkPanelChroma.get('hsl.h');
    const darkPanelSat = darkPanelChroma.get('hsl.s');
    const darkBorderHue = darkBorderChroma.get('hsl.h');
    const darkBorderSat = darkBorderChroma.get('hsl.s');

    const darkBackground = chroma.hsl(darkBgHue, darkBgSat, Math.random() * 0.4).hex();
    const darkPanel = Math.random() < 0.4 ? darkBackground : chroma.hsl(darkPanelHue, darkPanelSat, Math.random() * 0.4).hex();
    const darkTextColor = getAAATextColor(darkPanel);
    const darkBorderColor = chroma.hsl(darkBorderHue, darkBorderSat === 0 ? 0 : Math.min(1, darkBorderSat + 0.1), 0.2 + Math.random() * 0.15).hex();

    // Generate bloom border (same for both modes)
    let bloomBorderColor: string;
    if (Math.random() < 0.25) {
      bloomBorderColor = '#000000';
    } else {
      const borderBaseColor = chroma(shuffled[Math.floor(Math.random() * 4)]);
      bloomBorderColor = borderBaseColor.darken(0.5 + Math.random() * 0.5).hex();
    }
    const bloomBorderWidth = Math.random() < 0.3 ? '0' : Math.floor(Math.random() * 41).toString();

    // Randomize bloom shadow (50% chance to enable)
    const bloomShadowEnabled = Math.random() < 0.5;
    const bloomShadowColor = '#000000';
    // 20% chance for cartoon shadow (solid, no blur)
    const isBloomCartoonShadow = Math.random() < 0.2;
    const bloomShadowOffsetX = Math.floor(Math.random() * 13).toString(); // 0-12px
    const bloomShadowOffsetY = Math.floor(Math.random() * 13).toString(); // 0-12px
    const bloomShadowBlurRadius = isBloomCartoonShadow ? '0' : Math.floor(Math.random() * 21).toString(); // 0 for cartoon, 0-20px otherwise
    const bloomShadowOpacity = isBloomCartoonShadow ? '0.95' : (0.2 + Math.random() * 0.5).toFixed(2); // 0.95 for cartoon, 0.2-0.7 otherwise (more visible)

    // Helper to maybe create a gradient (25% chance)
    const maybeGradient = (baseColor: string, index: number, mode: 'light' | 'dark'): ColorValue => {
      if (Math.random() < 0.25) {
        // Create a gradient with 2 stops
        const angle = Math.floor(Math.random() * 360);

        // Vary the base color slightly for gradient stops
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();

        return {
          type: 'gradient',
          value: {
            id: `bloom-gradient-${mode}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            stops: [
              { color: color1, offset: '0%' },
              { color: color2, offset: '100%' },
            ],
            angle,
          },
        };
      }
      return { type: 'solid', value: baseColor };
    };

    // Generate title and description
    const titlePatterns = [
      () => `${faker.word.adjective()} ${faker.word.noun()}`,
      () => `${faker.word.adjective()} ${faker.word.adjective()} ${faker.word.noun()}`,
      () => `${faker.word.noun()} ${faker.word.preposition()} ${faker.word.noun()}`,
      () => `${faker.word.verb()} ${faker.word.noun()}`,
    ];
    const randomTitle = titlePatterns[Math.floor(Math.random() * titlePatterns.length)]();
    const title = randomTitle
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const descriptionPatterns = [
      () => `${faker.word.adjective()} ${faker.word.noun()} ${faker.word.verb()} ${faker.word.adverb()} ${faker.word.preposition()} ${faker.word.noun()}`,
      () => `${faker.word.verb()} the ${faker.word.adjective()} ${faker.word.noun()} ${faker.word.preposition()} ${faker.word.noun()}`,
      () => `${faker.word.adjective()} ${faker.word.noun()} and ${faker.word.adjective()} ${faker.word.noun()} ${faker.word.verb()} together`,
      () => `where ${faker.word.noun()} meets ${faker.word.noun()} in ${faker.word.adjective()} harmony`,
      () => `${faker.word.adverb()} ${faker.word.verb()} through ${faker.word.adjective()} ${faker.word.noun()}`,
    ];
    const randomDescription = descriptionPatterns[Math.floor(Math.random() * descriptionPatterns.length)]();
    const description = randomDescription.charAt(0).toUpperCase() + randomDescription.slice(1);

    // Shared styling (same for both modes)
    const fonts = ['sans-serif', 'serif', 'monospace'];
    const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
    const borderStyles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const randomBorderStyle = borderStyles[Math.floor(Math.random() * borderStyles.length)];
    const borderWidth = Math.floor(Math.random() * 6).toString();
    const borderRadius = Math.floor(Math.random() * 31).toString();

    // Generate bloom colors for light mode
    const lightBloomData = {
      primaryColor: maybeGradient(shuffled[0], 0, 'light'),
      secondaryColor: maybeGradient(shuffled[1], 1, 'light'),
      tertiaryColor: maybeGradient(shuffled[2], 2, 'light'),
      quaternaryColor: maybeGradient(shuffled[3], 3, 'light'),
      bloomBorderColor,
      bloomBorderWidth,
      bloomShadowEnabled,
      bloomShadowColor,
      bloomShadowOffsetX,
      bloomShadowOffsetY,
      bloomShadowBlurRadius,
      bloomShadowOpacity,
    };

    // Clone for dark mode with unique gradient IDs (same colors, different IDs)
    const darkBloomData = {
      primaryColor: cloneColorValueWithNewId(lightBloomData.primaryColor, 'dark', 0),
      secondaryColor: cloneColorValueWithNewId(lightBloomData.secondaryColor, 'dark', 1),
      tertiaryColor: cloneColorValueWithNewId(lightBloomData.tertiaryColor, 'dark', 2),
      quaternaryColor: cloneColorValueWithNewId(lightBloomData.quaternaryColor, 'dark', 3),
      bloomBorderColor,
      bloomBorderWidth,
      bloomShadowEnabled,
      bloomShadowColor,
      bloomShadowOffsetX,
      bloomShadowOffsetY,
      bloomShadowBlurRadius,
      bloomShadowOpacity,
    };

    // Generate controls (buttons and links) for both modes - pick from palette
    const buttonPaletteColor = shuffled[Math.floor(Math.random() * 4)];
    const buttonChroma = chroma(buttonPaletteColor);
    const controlHue = buttonChroma.get('hsl.h');
    const controlSat = buttonChroma.get('hsl.s');

    // Helper to maybe create a gradient for button (25% chance)
    const maybeButtonGradient = (baseColor: string): ColorValue => {
      if (Math.random() < 0.25) {
        const angle = Math.floor(Math.random() * 360);
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();
        return {
          type: 'gradient',
          value: {
            id: `button-gradient-${Date.now()}`,
            stops: [
              { color: color1, offset: '0%' },
              { color: color2, offset: '100%' },
            ],
            angle,
          },
        };
      }
      return { type: 'solid', value: baseColor };
    };

    const lightButtonBgColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.5 + Math.random() * 0.2).hex();
    const lightButtonBg = maybeButtonGradient(lightButtonBgColor);
    const lightButtonText = getAAATextColor(lightButtonBgColor);
    const lightButtonBorder = Math.random() < 0.3
      ? lightButtonBgColor
      : chroma(lightButtonBgColor).darken(0.5 + Math.random() * 0.5).hex();
    const lightLinkColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.2), 0.35 + Math.random() * 0.15).hex();
    const lightSelectionColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.70 + Math.random() * 0.15).hex();

    const darkButtonBgColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.4 + Math.random() * 0.2).hex();
    const darkButtonBg = maybeButtonGradient(darkButtonBgColor);
    const darkButtonText = getAAATextColor(darkButtonBgColor);
    const darkButtonBorder = Math.random() < 0.3
      ? darkButtonBgColor
      : chroma(darkButtonBgColor).brighten(0.5 + Math.random() * 0.5).hex();
    const darkLinkColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.2), 0.55 + Math.random() * 0.15).hex();
    const darkSelectionColor = chroma.hsl(controlHue, Math.min(1, controlSat + 0.1), 0.45 + Math.random() * 0.15).hex();

    const buttonBorderWidth = Math.floor(Math.random() * 4).toString();
    const buttonBorderStyles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const buttonBorderStyle = buttonBorderStyles[Math.floor(Math.random() * buttonBorderStyles.length)];
    const buttonBorderRadius = Math.floor(Math.random() * 51).toString();
    const underlineStyles: Array<'none' | 'underline' | 'always'> = ['none', 'underline', 'always'];
    const linkUnderlineStyle = underlineStyles[Math.floor(Math.random() * underlineStyles.length)];

    // Randomize panel shadow (15% chance to enable)
    const panelShadowEnabled = Math.random() < 0.15;
    const panelShadowColor = '#000000';
    const isPanelCartoonShadow = Math.random() < 0.1; // 10% chance for cartoon shadow
    const panelShadowOffsetX = Math.floor(Math.random() * 11).toString(); // 0-10px
    const panelShadowOffsetY = Math.floor(Math.random() * 11).toString(); // 0-10px
    const panelShadowBlurRadius = isPanelCartoonShadow ? '0' : Math.floor(Math.random() * 21).toString(); // 0 for cartoon, 0-20px otherwise
    const panelShadowOpacity = isPanelCartoonShadow ? '0.95' : (0.1 + Math.random() * 0.35).toFixed(2); // 0.95 for cartoon, 0.1-0.45 otherwise

    // Randomize button shadow (25% chance to enable)
    const buttonShadowEnabled = Math.random() < 0.25;
    const buttonShadowColor = '#000000';
    const isButtonCartoonShadow = Math.random() < 0.1; // 10% chance for cartoon shadow
    const buttonShadowOffsetX = Math.floor(Math.random() * 11).toString(); // 0-10px
    const buttonShadowOffsetY = Math.floor(Math.random() * 11).toString(); // 0-10px
    const buttonShadowBlurRadius = isButtonCartoonShadow ? '0' : Math.floor(Math.random() * 21).toString(); // 0 for cartoon, 0-20px otherwise
    const buttonShadowOpacity = isButtonCartoonShadow ? '0.95' : (0.1 + Math.random() * 0.35).toFixed(2); // 0.95 for cartoon, 0.1-0.45 otherwise

    setFormData((prev) => ({
      ...prev,
      title,
      description,
      light: {
        ...lightBloomData,
        backgroundColor: lightBackground,
        panelColor: lightPanel,
        textColor: lightTextColor,
        borderColor: lightBorderColor,
        borderWidth,
        borderRadius,
        borderStyle: randomBorderStyle,
        font: randomFont,
        panelShadowEnabled,
        panelShadowColor,
        panelShadowOffsetX,
        panelShadowOffsetY,
        panelShadowBlurRadius,
        panelShadowOpacity,
        buttonBackgroundColor: lightButtonBg,
        buttonTextColor: lightButtonText,
        buttonBorderColor: lightButtonBorder,
        buttonBorderWidth,
        buttonBorderStyle,
        buttonBorderRadius,
        buttonShadowEnabled,
        buttonShadowColor,
        buttonShadowOffsetX,
        buttonShadowOffsetY,
        buttonShadowBlurRadius,
        buttonShadowOpacity,
        linkColor: lightLinkColor,
        linkUnderlineStyle,
        selectionColor: lightSelectionColor,
      },
      dark: {
        ...darkBloomData,
        backgroundColor: darkBackground,
        panelColor: darkPanel,
        textColor: darkTextColor,
        borderColor: darkBorderColor,
        borderWidth,
        borderRadius,
        borderStyle: randomBorderStyle,
        font: randomFont,
        panelShadowEnabled,
        panelShadowColor,
        panelShadowOffsetX,
        panelShadowOffsetY,
        panelShadowBlurRadius,
        panelShadowOpacity,
        buttonBackgroundColor: darkButtonBg,
        buttonTextColor: darkButtonText,
        buttonBorderColor: darkButtonBorder,
        buttonBorderWidth,
        buttonBorderStyle,
        buttonBorderRadius,
        buttonShadowEnabled,
        buttonShadowColor,
        buttonShadowOffsetX,
        buttonShadowOffsetY,
        buttonShadowBlurRadius,
        buttonShadowOpacity,
        linkColor: darkLinkColor,
        linkUnderlineStyle,
        selectionColor: darkSelectionColor,
      },
    }));
  };

  return (
    <View style={styles.container}>
      {/* Left Side - Preview */}
      <View style={styles.leftPanel}>
        <ScrollView contentContainerStyle={styles.previewContent} style={styles.previewScroll}>
          <Text style={styles.previewTitle}>
            Preview - {formData.activeMode === 'light' ? 'Light' : 'Dark'} Mode
          </Text>

          <AnimatedPreviewContainer formData={formData} mode={formData.activeMode} transitionDuration={previewTransitionDuration}>
            {/* Wrap preview content with PreviewThemeProvider */}
            <PreviewThemeProvider formData={formData} mode={formData.activeMode} transitionDuration={previewTransitionDuration}>
              {/* CruxBloom */}
              <View style={styles.bloomContainer}>
                <CruxBloom
                  size={150}
                  theme={{
                    primary: formData[formData.activeMode].primaryColor,
                    secondary: formData[formData.activeMode].secondaryColor,
                    tertiary: formData[formData.activeMode].tertiaryColor,
                    quaternary: formData[formData.activeMode].quaternaryColor,
                    borderColor: formData[formData.activeMode].bloomBorderColor || undefined,
                    borderWidth: parseInt(formData[formData.activeMode].bloomBorderWidth ?? '0'),
                  }}
                  transitionDuration={previewTransitionDuration}
                />
              </View>

              {/* Sample Panel - Using themed Panel component */}
              <Panel nativeID="preview-panel" style={styles.samplePanel}>
                <ThemedText variant="heading" style={styles.sampleHeading}>
                  What is Crux Garden?
                </ThemedText>

                <ThemedText style={styles.sampleText}>
                  Crux Garden models how ideas manifest and develop over time. At its core is the Crux, an atomic unit of thought which is captured as digital content: text, media, code, anything.
                </ThemedText>

                <ThemedText style={styles.sampleText}>
                  Cruxes connect with each other through four dimensions: GATES (origins), GARDENS (consequences), GROWTH (evolution), and GRAFTS (associations).
                </ThemedText>

                <ThemedText style={styles.sampleText}>
                  These simple building blocks provide a foundation that is able to realize any kind of connected information: digital gardens, personal knowledge bases, home pages, blogs, interactive stories, product roadmaps, research networks, anything.
                </ThemedText>

                <ThemedText style={styles.sampleText}>
                  To understand the goals and ambitions of Crux Garden, explore the history of the Digital Garden movement and read Vannevar Bush's 1945 essay As We May Think.
                </ThemedText>

                <ThemedText style={styles.sampleText}>
                  Will Stepp, October 2025
                </ThemedText>

                {/* Sample Button and Link - Centered */}
                <View style={styles.sampleControlsContainer}>
                  <ThemedButton
                    title="The Digital Garden Movement"
                    onPress={() => {}}
                  />
                  <Link onPress={() => {}}>
                    As We May Think, 1945 - Vannevar Bush
                  </Link>
                </View>
              </Panel>
            </PreviewThemeProvider>
          </AnimatedPreviewContainer>
        </ScrollView>
      </View>

      {/* Right Side - Controls */}
      <ScrollView style={styles.rightPanel} contentContainerStyle={styles.controlsContent}>
        <Text style={styles.title}>Theme Builder</Text>

      {/* Basic Information */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('details')}
          >
            <Text style={styles.sectionTitle}>Details</Text>
            <Text style={styles.sectionToggle}>{expandedSections.details ? '−' : '+'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sectionRandomize}
            onPress={() => withTransition(randomizeDetails)}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.details && (
        <>
        <View style={styles.field}>
          <Text style={styles.label}>
            Title <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={formData.title}
            onChangeText={(value) => handleFieldChange('title', value)}
            placeholder="e.g., Ocean Breeze"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={formData.description || ''}
            onChangeText={(value) => handleFieldChange('description', value)}
            placeholder="A brief description of your theme"
            placeholderTextColor="#666"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Type</Text>
            <TextInput
              style={styles.input}
              value={formData.type || ''}
              onChangeText={(value) => handleFieldChange('type', value)}
              placeholder="e.g., light, dark"
              placeholderTextColor="#666"
            />
          </View>

          <View style={[styles.field, styles.flex1]}>
            <Text style={styles.label}>Kind</Text>
            <TextInput
              style={styles.input}
              value={formData.kind || ''}
              onChangeText={(value) => handleFieldChange('kind', value)}
              placeholder="e.g., nature, tech"
              placeholderTextColor="#666"
            />
          </View>
        </View>
        </>
        )}
      </View>

      {/* Mode Switcher */}
      <View style={styles.section}>
        <Text style={styles.label}>Mode</Text>
        <View style={styles.modeTabs}>
          <TouchableOpacity
            style={[
              styles.modeTab,
              formData.activeMode === 'light' && styles.modeTabActive,
            ]}
            onPress={() => setFormData((prev) => ({ ...prev, activeMode: 'light' }))}
          >
            <Text style={[
              styles.modeTabText,
              formData.activeMode === 'light' && styles.modeTabTextActive,
            ]}>
              ☀️ Light
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeTab,
              formData.activeMode === 'dark' && styles.modeTabActive,
            ]}
            onPress={() => setFormData((prev) => ({ ...prev, activeMode: 'dark' }))}
          >
            <Text style={[
              styles.modeTabText,
              formData.activeMode === 'dark' && styles.modeTabTextActive,
            ]}>
              🌙 Dark
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Palette Generator */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('palette')}
          >
            <Text style={styles.sectionTitle}>Palette</Text>
            <Text style={styles.sectionToggle}>{expandedSections.palette ? '−' : '+'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sectionRandomize}
            onPress={() => withTransition(handleRandomize)}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.palette && (
        <>
        <Text style={styles.sectionHelperText}>
          Changes you make in this section will apply to {updateBothModesPalette ? 'both themes' : `${formData.activeMode} theme`}
        </Text>

        {/* Update Both Modes Checkbox */}
        <TouchableOpacity
          style={styles.modeCheckboxContainer}
          onPress={() => setUpdateBothModesPalette(!updateBothModesPalette)}
        >
          <View style={[styles.checkbox, updateBothModesPalette && styles.checkboxChecked]}>
            {updateBothModesPalette && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text style={styles.modeCheckboxLabel}>Update both modes (light and dark)</Text>
        </TouchableOpacity>

        <Text style={styles.sectionDescription}>
          Generate color palettes using color harmony theory.
        </Text>

        {/* Harmony Type Selector */}
        <View style={styles.field}>
          <Text style={styles.label}>Harmony Type</Text>
          <View style={styles.harmonyButtons}>
            <TouchableOpacity
              style={[
                styles.harmonyButton,
                selectedHarmony === 'monochromatic' && styles.harmonyButtonActive,
              ]}
              onPress={() => setSelectedHarmony('monochromatic')}
            >
              <Text
                style={[
                  styles.harmonyButtonText,
                  selectedHarmony === 'monochromatic' && styles.harmonyButtonTextActive,
                ]}
              >
                Mono
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.harmonyButton,
                selectedHarmony === 'complementary' && styles.harmonyButtonActive,
              ]}
              onPress={() => setSelectedHarmony('complementary')}
            >
              <Text
                style={[
                  styles.harmonyButtonText,
                  selectedHarmony === 'complementary' && styles.harmonyButtonTextActive,
                ]}
              >
                Comp
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.harmonyButton,
                selectedHarmony === 'analogous' && styles.harmonyButtonActive,
              ]}
              onPress={() => setSelectedHarmony('analogous')}
            >
              <Text
                style={[
                  styles.harmonyButtonText,
                  selectedHarmony === 'analogous' && styles.harmonyButtonTextActive,
                ]}
              >
                Analog
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.harmonyButton,
                selectedHarmony === 'triadic' && styles.harmonyButtonActive,
              ]}
              onPress={() => setSelectedHarmony('triadic')}
            >
              <Text
                style={[
                  styles.harmonyButtonText,
                  selectedHarmony === 'triadic' && styles.harmonyButtonTextActive,
                ]}
              >
                Triad
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.harmonyButton,
                selectedHarmony === 'split-complementary' && styles.harmonyButtonActive,
              ]}
              onPress={() => setSelectedHarmony('split-complementary')}
            >
              <Text
                style={[
                  styles.harmonyButtonText,
                  selectedHarmony === 'split-complementary' && styles.harmonyButtonTextActive,
                ]}
              >
                Split
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.harmonyButton,
                selectedHarmony === 'random' && styles.harmonyButtonActive,
              ]}
              onPress={() => {
                setSelectedHarmony('random');
                // Increment seed to force regeneration even if already selected
                setRandomSeed(prev => prev + 1);
              }}
            >
              <Text
                style={[
                  styles.harmonyButtonText,
                  selectedHarmony === 'random' && styles.harmonyButtonTextActive,
                ]}
              >
                Random
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Palette Preview */}
        <View style={styles.activePaletteContainer}>
          <Text style={styles.activePaletteLabel}>Palette Preview (click to edit)</Text>
          <View style={styles.activePaletteRow}>
            {previewPalette.length > 0 ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[0] },
                  ]}
                  onPress={() => handlePaletteColorClick(0)}
                />
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[1] },
                  ]}
                  onPress={() => handlePaletteColorClick(1)}
                />
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[2] },
                  ]}
                  onPress={() => handlePaletteColorClick(2)}
                />
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[3] },
                  ]}
                  onPress={() => handlePaletteColorClick(3)}
                />
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData[formData.activeMode].primaryColor) },
                  ]}
                  onPress={() => handlePaletteColorClick(0)}
                />
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData[formData.activeMode].secondaryColor) },
                  ]}
                  onPress={() => handlePaletteColorClick(1)}
                />
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData[formData.activeMode].tertiaryColor) },
                  ]}
                  onPress={() => handlePaletteColorClick(2)}
                />
                <TouchableOpacity
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData[formData.activeMode].quaternaryColor) },
                  ]}
                  onPress={() => handlePaletteColorClick(3)}
                />
              </>
            )}
          </View>
        </View>

        {/* Color Edit Modal */}
        {editingPaletteIndex !== null && (
          <View style={styles.colorEditModal}>
            <View style={styles.colorEditContent}>
              <Text style={styles.colorEditTitle}>Edit Palette Color {editingPaletteIndex + 1}</Text>

              <View style={styles.colorEditPreview}>
                <View
                  style={[
                    styles.colorEditPreviewBox,
                    { backgroundColor: editingPaletteColor },
                  ]}
                />
              </View>

              <HexColorInput
                label="Hex Color"
                value={editingPaletteColor}
                onChange={setEditingPaletteColor}
                placeholder="#ff0000"
              />

              <View style={styles.colorEditButtons}>
                <TouchableOpacity
                  style={[styles.colorEditButton, styles.colorEditButtonCancel]}
                  onPress={handleCancelPaletteEdit}
                >
                  <Text style={styles.colorEditButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.colorEditButton, styles.colorEditButtonSave]}
                  onPress={handleSavePaletteColor}
                >
                  <Text style={styles.colorEditButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Base Hue Slider */}
        <View style={styles.field}>
          <Text style={styles.label}>Base Hue: {Math.round(baseHue)}°</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={360}
            step={0.1}
            value={baseHue}
            onValueChange={setBaseHue}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        {/* Base Saturation Slider */}
        <View style={styles.field}>
          <Text style={styles.label}>Base Saturation: {Math.round(baseSaturation)}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={0.1}
            value={baseSaturation}
            onValueChange={setBaseSaturation}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        {/* Base Lightness Slider */}
        <View style={styles.field}>
          <Text style={styles.label}>Base Lightness: {Math.round(baseLightness)}%</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={0.1}
            value={baseLightness}
            onValueChange={setBaseLightness}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        {/* Apply Palette Button */}
        <TouchableOpacity
          style={styles.generateButton}
          onPress={() => withTransition(handleGenerateUIColors)}
          disabled={isSaving}
        >
          <Text style={styles.generateButtonText}>Apply Palette</Text>
        </TouchableOpacity>
        </>
        )}
      </View>

      {/* Bloom Colors */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('bloom')}
          >
            <Text style={styles.sectionTitle}>Bloom</Text>
            <Text style={styles.sectionToggle}>{expandedSections.bloom ? '−' : '+'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sectionRandomize}
            onPress={() => withTransition(randomizeBloom)}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.bloom && (
        <>
        <Text style={styles.sectionHelperText}>
          Changes you make in this section will apply to {updateBothModesBloom ? 'both themes' : `${formData.activeMode} theme`}
        </Text>

        {/* Update Both Modes Checkbox */}
        <TouchableOpacity
          style={styles.modeCheckboxContainer}
          onPress={() => setUpdateBothModesBloom(!updateBothModesBloom)}
        >
          <View style={[styles.checkbox, updateBothModesBloom && styles.checkboxChecked]}>
            {updateBothModesBloom && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text style={styles.modeCheckboxLabel}>Update both modes (light and dark)</Text>
        </TouchableOpacity>

        <Text style={styles.sectionDescription}>
          These colors are used in the Crux bloom icon. You can use solid colors or gradients.
        </Text>

        {/* Bloom Border Controls */}
        <HexColorInput
          label="Bloom Border Color"
          value={formData[formData.activeMode].bloomBorderColor || ''}
          onChange={(value) => handleModeFieldChange('bloomBorderColor', value, 'bloom')}
          placeholder="#000000"
        />

        <View style={styles.field}>
          <Text style={styles.label}>
            Bloom Border Width: {typeof formData[formData.activeMode].bloomBorderWidth === 'number' ? formData[formData.activeMode].bloomBorderWidth : parseInt(formData[formData.activeMode].bloomBorderWidth ?? '0')}
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={75}
            step={1}
            value={parseInt(formData[formData.activeMode].bloomBorderWidth?.toString() ?? '0')}
            onValueChange={(val) => handleModeFieldChange('bloomBorderWidth', Math.round(val).toString(), 'bloom')}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        {/* Bloom Tabs */}
        <View style={styles.bloomTabs}>
          <TouchableOpacity
            style={[
              styles.bloomTab,
              activeBloomTab === 'primary' && styles.bloomTabActive,
              { borderBottomColor: getBloomColor(formData[formData.activeMode].primaryColor) },
            ]}
            onPress={() => setActiveBloomTab('primary')}
          >
            <Text style={[styles.bloomTabText, activeBloomTab === 'primary' && styles.bloomTabTextActive]}>
              Primary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.bloomTab,
              activeBloomTab === 'secondary' && styles.bloomTabActive,
              { borderBottomColor: getBloomColor(formData[formData.activeMode].secondaryColor) },
            ]}
            onPress={() => setActiveBloomTab('secondary')}
          >
            <Text style={[styles.bloomTabText, activeBloomTab === 'secondary' && styles.bloomTabTextActive]}>
              Secondary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.bloomTab,
              activeBloomTab === 'tertiary' && styles.bloomTabActive,
              { borderBottomColor: getBloomColor(formData[formData.activeMode].tertiaryColor) },
            ]}
            onPress={() => setActiveBloomTab('tertiary')}
          >
            <Text style={[styles.bloomTabText, activeBloomTab === 'tertiary' && styles.bloomTabTextActive]}>
              Tertiary
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.bloomTab,
              activeBloomTab === 'quaternary' && styles.bloomTabActive,
              { borderBottomColor: getBloomColor(formData[formData.activeMode].quaternaryColor) },
            ]}
            onPress={() => setActiveBloomTab('quaternary')}
          >
            <Text style={[styles.bloomTabText, activeBloomTab === 'quaternary' && styles.bloomTabTextActive]}>
              Quaternary
            </Text>
          </TouchableOpacity>
        </View>

        {/* Active Tab Content */}
        <View style={styles.bloomTabContent}>
          {activeBloomTab === 'primary' && (
            <ColorPicker
              label="Primary (Outermost)"
              value={formData[formData.activeMode].primaryColor}
              onChange={handleColorChange('primaryColor')}
            />
          )}
          {activeBloomTab === 'secondary' && (
            <ColorPicker
              label="Secondary"
              value={formData[formData.activeMode].secondaryColor}
              onChange={handleColorChange('secondaryColor')}
            />
          )}
          {activeBloomTab === 'tertiary' && (
            <ColorPicker
              label="Tertiary"
              value={formData[formData.activeMode].tertiaryColor}
              onChange={handleColorChange('tertiaryColor')}
            />
          )}
          {activeBloomTab === 'quaternary' && (
            <ColorPicker
              label="Quaternary (Innermost)"
              value={formData[formData.activeMode].quaternaryColor}
              onChange={handleColorChange('quaternaryColor')}
            />
          )}
        </View>
        </>
        )}
      </View>

      {/* UI Styling */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('style')}
          >
            <Text style={styles.sectionTitle}>Content</Text>
            <Text style={styles.sectionToggle}>{expandedSections.style ? '−' : '+'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sectionRandomize}
            onPress={() => withTransition(randomizeStyle)}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.style && (
        <>
        <Text style={styles.sectionHelperText}>
          Changes you make in this section will apply to {updateBothModesStyle ? 'both themes' : `${formData.activeMode} theme`}
        </Text>

        {/* Update Both Modes Checkbox */}
        <TouchableOpacity
          style={styles.modeCheckboxContainer}
          onPress={() => setUpdateBothModesStyle(!updateBothModesStyle)}
        >
          <View style={[styles.checkbox, updateBothModesStyle && styles.checkboxChecked]}>
            {updateBothModesStyle && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text style={styles.modeCheckboxLabel}>Update both modes (light and dark)</Text>
        </TouchableOpacity>

        <Text style={styles.sectionDescription}>
          Optional styling for your app's user interface.
        </Text>

        <HexColorInput
          label="Border Color"
          value={formData[formData.activeMode].borderColor || ''}
          onChange={(value) => handleModeFieldChange('borderColor', value, 'style')}
          placeholder="#cccccc"
        />

        <View style={styles.field}>
          <Text style={styles.label}>
            Border Width: {typeof formData[formData.activeMode].borderWidth === 'number' ? formData[formData.activeMode].borderWidth : parseInt(formData[formData.activeMode].borderWidth ?? '1')}px
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={10}
            step={1}
            value={parseInt(formData[formData.activeMode].borderWidth?.toString() ?? '1')}
            onValueChange={(val) => handleModeFieldChange('borderWidth', Math.round(val).toString(), 'style')}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Border Radius: {typeof formData[formData.activeMode].borderRadius === 'number' ? formData[formData.activeMode].borderRadius : parseInt(formData[formData.activeMode].borderRadius ?? '0')}px
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={50}
            step={1}
            value={parseInt(formData[formData.activeMode].borderRadius?.toString() ?? '0')}
            onValueChange={(val) => handleModeFieldChange('borderRadius', Math.round(val).toString(), 'style')}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Border Style</Text>
          <View style={styles.fontToggle}>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].borderStyle === 'solid' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('borderStyle', 'solid', 'style')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].borderStyle === 'solid' && styles.fontButtonTextActive,
                ]}
              >
                Solid
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].borderStyle === 'dashed' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('borderStyle', 'dashed', 'style')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].borderStyle === 'dashed' && styles.fontButtonTextActive,
                ]}
              >
                Dashed
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].borderStyle === 'dotted' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('borderStyle', 'dotted', 'style')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].borderStyle === 'dotted' && styles.fontButtonTextActive,
                ]}
              >
                Dotted
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <HexColorInput
          label="Background Color"
          value={formData[formData.activeMode].backgroundColor || ''}
          onChange={(value) => handleModeFieldChange('backgroundColor', value, 'style')}
          placeholder="#ffffff"
        />

        <HexColorInput
          label="Panel Color"
          value={formData[formData.activeMode].panelColor || ''}
          onChange={(value) => handleModeFieldChange('panelColor', value, 'style')}
          placeholder="#f5f5f5"
        />

        <HexColorInput
          label="Text Color"
          value={formData[formData.activeMode].textColor || ''}
          onChange={(value) => handleModeFieldChange('textColor', value, 'style')}
          placeholder="#000000"
        />

        {/* Contrast Indicator */}
        {formData[formData.activeMode].panelColor && formData[formData.activeMode].textColor && (() => {
          try {
            const panelCol = formData[formData.activeMode].panelColor!;
            const textCol = formData[formData.activeMode].textColor!;
            const ratio = chroma.contrast(panelCol, textCol);
            const passAA = ratio >= 4.5;
            const passAAA = ratio >= 7;
            const closeAA = ratio >= 3.5 && ratio < 4.5; // Close to AA
            const closeAAA = ratio >= 6.0 && ratio < 7; // Close to AAA

            return (
              <View style={styles.contrastIndicator}>
                <Text style={styles.contrastLabel}>Text Readability</Text>
                <View style={styles.contrastInfo}>
                  <Text style={styles.contrastRatio}>{ratio.toFixed(2)}:1</Text>
                  <View style={styles.contrastBadges}>
                    <View style={[
                      styles.contrastBadge,
                      passAA && styles.contrastBadgePass,
                      closeAA && styles.contrastBadgeWarn,
                      !passAA && !closeAA && styles.contrastBadgeFail
                    ]}>
                      <Text style={[
                        styles.contrastBadgeText,
                        passAA && styles.contrastBadgeTextPass,
                        closeAA && styles.contrastBadgeTextWarn,
                        !passAA && !closeAA && styles.contrastBadgeTextFail
                      ]}>
                        {passAA ? '✓' : closeAA ? '~' : '✗'} AA
                      </Text>
                    </View>
                    <View style={[
                      styles.contrastBadge,
                      passAAA && styles.contrastBadgePass,
                      closeAAA && styles.contrastBadgeWarn,
                      !passAAA && !closeAAA && styles.contrastBadgeFail
                    ]}>
                      <Text style={[
                        styles.contrastBadgeText,
                        passAAA && styles.contrastBadgeTextPass,
                        closeAAA && styles.contrastBadgeTextWarn,
                        !passAAA && !closeAAA && styles.contrastBadgeTextFail
                      ]}>
                        {passAAA ? '✓' : closeAAA ? '~' : '✗'} AAA
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          } catch (e) {
            return null;
          }
        })()}

        <View style={styles.field}>
          <Text style={styles.label}>Font Family</Text>
          <View style={styles.fontToggle}>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].font === 'sans-serif' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('font', 'sans-serif', 'style')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].font === 'sans-serif' && styles.fontButtonTextActive,
                ]}
              >
                Sans Serif
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].font === 'serif' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('font', 'serif', 'style')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].font === 'serif' && styles.fontButtonTextActive,
                ]}
              >
                Serif
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].font === 'monospace' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('font', 'monospace', 'style')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].font === 'monospace' && styles.fontButtonTextActive,
                ]}
              >
                Monospace
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Panel Shadow Controls */}
        <ShadowControls
          label="Panel Shadow"
          enabled={formData[formData.activeMode].panelShadowEnabled}
          color={formData[formData.activeMode].panelShadowColor}
          offsetX={formData[formData.activeMode].panelShadowOffsetX}
          offsetY={formData[formData.activeMode].panelShadowOffsetY}
          blurRadius={formData[formData.activeMode].panelShadowBlurRadius}
          opacity={formData[formData.activeMode].panelShadowOpacity}
          onChange={(field, value) => {
            if (field === 'enabled') {
              handleModeFieldChange('panelShadowEnabled', value as boolean, 'style');
            } else if (field === 'color') {
              handleModeFieldChange('panelShadowColor', value as string, 'style');
            } else if (field === 'offsetX') {
              handleModeFieldChange('panelShadowOffsetX', value as string, 'style');
            } else if (field === 'offsetY') {
              handleModeFieldChange('panelShadowOffsetY', value as string, 'style');
            } else if (field === 'blurRadius') {
              handleModeFieldChange('panelShadowBlurRadius', value as string, 'style');
            } else if (field === 'opacity') {
              handleModeFieldChange('panelShadowOpacity', value as string, 'style');
            }
          }}
        />

        {/* Text Selection Styling */}
        <Text style={[styles.label, { marginTop: 16, marginBottom: 12, fontSize: 16, color: '#4dd9b8' }]}>Text Selection</Text>

        <HexColorInput
          label="Selection Color"
          value={formData[formData.activeMode].selectionColor || ''}
          onChange={(value) => handleModeFieldChange('selectionColor', value, 'style')}
          placeholder={formData.activeMode === 'light' ? '#b3d9ff' : '#4a9eff'}
        />
        </>
        )}
      </View>

      {/* Controls */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('controls')}
          >
            <Text style={styles.sectionTitle}>Controls</Text>
            <Text style={styles.sectionToggle}>{expandedSections.controls ? '−' : '+'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sectionRandomize}
            onPress={() => withTransition(randomizeControls)}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.controls && (
        <>
        <Text style={styles.sectionHelperText}>
          Changes you make in this section will apply to {updateBothModesControls ? 'both themes' : `${formData.activeMode} theme`}
        </Text>

        {/* Update Both Modes Checkbox */}
        <TouchableOpacity
          style={styles.modeCheckboxContainer}
          onPress={() => setUpdateBothModesControls(!updateBothModesControls)}
        >
          <View style={[styles.checkbox, updateBothModesControls && styles.checkboxChecked]}>
            {updateBothModesControls && <Text style={styles.checkboxCheck}>✓</Text>}
          </View>
          <Text style={styles.modeCheckboxLabel}>Update both modes (light and dark)</Text>
        </TouchableOpacity>

        <Text style={styles.sectionDescription}>
          Button and link styling for interactive elements.
        </Text>

        {/* Button Styling */}
        <Text style={[styles.label, { marginTop: 8, marginBottom: 12, fontSize: 16, color: '#4dd9b8' }]}>Button</Text>

        <ColorPicker
          label="Button Background"
          value={formData[formData.activeMode].buttonBackgroundColor || { type: 'solid', value: '#4dd9b8' }}
          onChange={(value) => handleModeFieldChange('buttonBackgroundColor', value, 'controls')}
        />

        <HexColorInput
          label="Button Text Color"
          value={formData[formData.activeMode].buttonTextColor || ''}
          onChange={(value) => handleModeFieldChange('buttonTextColor', value, 'controls')}
          placeholder="#0f1214"
        />

        <HexColorInput
          label="Button Border Color"
          value={formData[formData.activeMode].buttonBorderColor || ''}
          onChange={(value) => handleModeFieldChange('buttonBorderColor', value, 'controls')}
          placeholder="#4dd9b8"
        />

        <View style={styles.field}>
          <Text style={styles.label}>
            Button Border Width: {typeof formData[formData.activeMode].buttonBorderWidth === 'number' ? formData[formData.activeMode].buttonBorderWidth : parseInt(formData[formData.activeMode].buttonBorderWidth ?? '1')}px
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={10}
            step={1}
            value={parseInt(formData[formData.activeMode].buttonBorderWidth?.toString() ?? '1')}
            onValueChange={(val) => handleModeFieldChange('buttonBorderWidth', Math.round(val).toString(), 'controls')}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Button Border Style</Text>
          <View style={styles.fontToggle}>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].buttonBorderStyle === 'solid' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('buttonBorderStyle', 'solid', 'controls')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].buttonBorderStyle === 'solid' && styles.fontButtonTextActive,
                ]}
              >
                Solid
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].buttonBorderStyle === 'dashed' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('buttonBorderStyle', 'dashed', 'controls')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].buttonBorderStyle === 'dashed' && styles.fontButtonTextActive,
                ]}
              >
                Dashed
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].buttonBorderStyle === 'dotted' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('buttonBorderStyle', 'dotted', 'controls')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].buttonBorderStyle === 'dotted' && styles.fontButtonTextActive,
                ]}
              >
                Dotted
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Button Border Radius: {typeof formData[formData.activeMode].buttonBorderRadius === 'number' ? formData[formData.activeMode].buttonBorderRadius : parseInt(formData[formData.activeMode].buttonBorderRadius ?? '6')}px
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={50}
            step={1}
            value={parseInt(formData[formData.activeMode].buttonBorderRadius?.toString() ?? '6')}
            onValueChange={(val) => handleModeFieldChange('buttonBorderRadius', Math.round(val).toString(), 'controls')}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        {/* Link Styling */}
        <Text style={[styles.label, { marginTop: 16, marginBottom: 12, fontSize: 16, color: '#4dd9b8' }]}>Link</Text>

        <HexColorInput
          label="Link Color"
          value={formData[formData.activeMode].linkColor || ''}
          onChange={(value) => handleModeFieldChange('linkColor', value, 'controls')}
          placeholder="#2563eb"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Link Underline Style</Text>
          <View style={styles.fontToggle}>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].linkUnderlineStyle === 'none' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('linkUnderlineStyle', 'none', 'controls')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].linkUnderlineStyle === 'none' && styles.fontButtonTextActive,
                ]}
              >
                None
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].linkUnderlineStyle === 'underline' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('linkUnderlineStyle', 'underline', 'controls')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].linkUnderlineStyle === 'underline' && styles.fontButtonTextActive,
                ]}
              >
                Underline
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData[formData.activeMode].linkUnderlineStyle === 'always' && styles.fontButtonActive,
              ]}
              onPress={() => handleModeFieldChange('linkUnderlineStyle', 'always', 'controls')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData[formData.activeMode].linkUnderlineStyle === 'always' && styles.fontButtonTextActive,
                ]}
              >
                Always
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Button Shadow Controls */}
        <ShadowControls
          label="Button Shadow"
          enabled={formData[formData.activeMode].buttonShadowEnabled}
          color={formData[formData.activeMode].buttonShadowColor}
          offsetX={formData[formData.activeMode].buttonShadowOffsetX}
          offsetY={formData[formData.activeMode].buttonShadowOffsetY}
          blurRadius={formData[formData.activeMode].buttonShadowBlurRadius}
          opacity={formData[formData.activeMode].buttonShadowOpacity}
          onChange={(field, value) => {
            if (field === 'enabled') {
              handleModeFieldChange('buttonShadowEnabled', value as boolean, 'controls');
            } else if (field === 'color') {
              handleModeFieldChange('buttonShadowColor', value as string, 'controls');
            } else if (field === 'offsetX') {
              handleModeFieldChange('buttonShadowOffsetX', value as string, 'controls');
            } else if (field === 'offsetY') {
              handleModeFieldChange('buttonShadowOffsetY', value as string, 'controls');
            } else if (field === 'blurRadius') {
              handleModeFieldChange('buttonShadowBlurRadius', value as string, 'controls');
            } else if (field === 'opacity') {
              handleModeFieldChange('buttonShadowOpacity', value as string, 'controls');
            }
          }}
        />
        </>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.randomizeAllButton]}
          onPress={() => withTransition(randomizeAll)}
          disabled={isSaving}
        >
          <Text style={styles.randomizeAllButtonText}>🎲 Randomize All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.applyButton]}
          onPress={() => withTransition(handleApplyTheme)}
          disabled={isSaving}
        >
          <Text style={styles.buttonText}>✨ Apply Theme</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.buttonText}>
            {isSaving ? 'Saving...' : (isEditMode ? 'Update Theme' : 'Create Theme')}
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#0F1214',
  },
  leftPanel: {
    flex: 7,
    borderRightWidth: 1,
    borderRightColor: '#2a3138',
  },
  rightPanel: {
    flex: 3,
  },
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    padding: 24,
    flexGrow: 1,
  },
  controlsContent: {
    padding: 24,
    paddingBottom: 40,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4dd9b8',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e8eef2',
    marginBottom: 24,
  },
  previewContainer: {
    padding: 32,
    flex: 1,
  },
  bloomContainer: {
    marginBottom: 32,
    alignItems: 'center',
  },
  samplePanel: {
    padding: 24,
    width: '100%',
  },
  sampleHeading: {
    marginBottom: 16,
  },
  sampleText: {
    marginBottom: 16,
  },
  sampleSubtext: {
    fontSize: 14,
  },
  sampleControlsContainer: {
    marginTop: 20,
    alignItems: 'center',
    gap: 16,
  },
  sampleButtonWrapper: {
    minWidth: 150,
  },
  sampleLink: {
    textAlign: 'center',
  },
  fontToggle: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  fontButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3138',
    backgroundColor: '#1a1f24',
    flex: 1,
    alignItems: 'center',
  },
  fontButtonActive: {
    backgroundColor: '#4dd9b8',
    borderColor: '#4dd9b8',
  },
  fontButtonText: {
    fontSize: 14,
    color: '#8b9298',
    fontWeight: '600',
  },
  fontButtonTextActive: {
    color: '#0f1214',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeader: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
  },
  sectionRandomize: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#1a1f24',
    borderWidth: 1,
    borderColor: '#2a3138',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  sectionRandomizeText: {
    fontSize: 18,
    color: '#4dd9b8',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4dd9b8',
  },
  sectionToggle: {
    fontSize: 24,
    fontWeight: '300',
    color: '#4dd9b8',
    width: 24,
    textAlign: 'center',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#8b9298',
    marginBottom: 16,
  },
  sectionHelperText: {
    fontSize: 13,
    color: '#4dd9b8',
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 6,
  },
  required: {
    color: '#e74c3c',
  },
  input: {
    backgroundColor: '#1a1f24',
    borderWidth: 1,
    borderColor: '#2a3138',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#e8eef2',
    fontSize: 16,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  actions: {
    marginTop: 24,
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    backgroundColor: '#4dd9b8',
  },
  randomizeAllButton: {
    backgroundColor: '#7c3aed',
  },
  applyButton: {
    backgroundColor: '#f59e0b',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f1214',
  },
  randomizeAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  bloomTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3138',
  },
  bloomTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  bloomTabActive: {
    borderBottomWidth: 3,
  },
  bloomTabText: {
    fontSize: 13,
    color: '#8b9298',
    fontWeight: '600',
  },
  bloomTabTextActive: {
    color: '#e8eef2',
  },
  bloomTabContent: {
    minHeight: 200,
  },
  harmonyButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  harmonyButton: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3138',
    backgroundColor: '#1a1f24',
    alignItems: 'center',
  },
  harmonyButtonActive: {
    backgroundColor: '#4dd9b8',
    borderColor: '#4dd9b8',
  },
  harmonyButtonText: {
    fontSize: 12,
    color: '#8b9298',
    fontWeight: '600',
  },
  harmonyButtonTextActive: {
    color: '#0f1214',
  },
  hueSliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hueSliderWrapper: {
    flex: 1,
  },
  hueSlider: {
    width: '100%',
    height: 40,
  },
  huePreview: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a3138',
    flexShrink: 0,
  },
  palettePreview: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a3138',
    marginBottom: 16,
  },
  activePaletteContainer: {
    marginBottom: 16,
  },
  activePaletteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b9298',
    marginBottom: 8,
  },
  activePaletteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  paletteColorBox: {
    flex: 1,
    height: 50,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2a3138',
  },
  generateButton: {
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#4dd9b8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f1214',
  },
  contrastIndicator: {
    marginTop: 8,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#1a1f24',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  contrastLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8b9298',
    marginBottom: 8,
  },
  contrastInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contrastRatio: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e8eef2',
  },
  contrastBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  contrastBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#2a3138',
    borderWidth: 1,
    borderColor: '#3a4148',
  },
  contrastBadgePass: {
    backgroundColor: '#1a4d2e',
    borderColor: '#2d7a4a',
  },
  contrastBadgeWarn: {
    backgroundColor: '#4d3a1a',
    borderColor: '#7a5e2d',
  },
  contrastBadgeFail: {
    backgroundColor: '#4d1a1a',
    borderColor: '#7a2d2d',
  },
  contrastBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8b9298',
  },
  contrastBadgeTextPass: {
    color: '#4dd9b8',
  },
  contrastBadgeTextWarn: {
    color: '#f5b942',
  },
  contrastBadgeTextFail: {
    color: '#e74c3c',
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3138',
    backgroundColor: '#1a1f24',
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#4dd9b8',
    borderColor: '#4dd9b8',
  },
  modeTabText: {
    fontSize: 14,
    color: '#8b9298',
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: '#0f1214',
  },
  colorEditModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  colorEditContent: {
    backgroundColor: '#1a1f24',
    borderRadius: 12,
    padding: 24,
    width: 320,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  colorEditTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e8eef2',
    marginBottom: 20,
    textAlign: 'center',
  },
  colorEditPreview: {
    alignItems: 'center',
    marginBottom: 20,
  },
  colorEditPreviewBox: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a3138',
  },
  colorEditButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  colorEditButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  colorEditButtonCancel: {
    backgroundColor: '#2a3138',
  },
  colorEditButtonSave: {
    backgroundColor: '#4dd9b8',
  },
  colorEditButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#e8eef2',
  },
  modeCheckboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#4dd9b8',
    backgroundColor: '#1a1f24',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: '#4dd9b8',
  },
  checkboxCheck: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f1214',
  },
  modeCheckboxLabel: {
    fontSize: 14,
    color: '#e8eef2',
    fontWeight: '500',
  },
});

export * from './types';
export { HexColorInput } from './HexColorInput';
export { ColorPicker } from './ColorPicker';
