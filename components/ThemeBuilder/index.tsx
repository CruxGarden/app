/**
 * ThemeBuilder Component
 *
 * A comprehensive builder for creating and editing themes
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Slider from '@react-native-community/slider';
import chroma from 'chroma-js';
import { faker } from '@faker-js/faker';
import { CruxBloom } from '@/components/CruxBloom';
import { ColorPicker } from './ColorPicker';
import { HexColorInput } from './HexColorInput';
import type { ThemeFormData, ThemeDto, ColorValue } from './types';
import { getDefaultThemeFormData, formDataToDto } from './types';

export interface ThemeBuilderProps {
  /** Initial theme data for editing (optional) */
  initialData?: ThemeFormData;
  /** Callback when theme is saved */
  onSave: (theme: ThemeDto) => Promise<void>;
  /** Callback when cancelled */
  onCancel: () => void;
}

// ============================================================================
// DEVELOPMENT CONFIGURATION - Background/Panel Constraints
// ============================================================================
// Toggle this to experiment with unconstrained vs constrained palette generation
const CONSTRAIN_BACKGROUND_PANEL = false;

// Constrained ranges (only used if CONSTRAIN_BACKGROUND_PANEL = true)
const DARK_BG_RANGE = { min: 0.08, max: 0.16 };    // 8-16% lightness
const LIGHT_BG_RANGE = { min: 0.92, max: 0.98 };   // 92-98% lightness
const DARK_PANEL_RANGE = { min: 0.12, max: 0.20 }; // 12-20% lightness
const LIGHT_PANEL_RANGE = { min: 0.95, max: 0.99 }; // 95-99% lightness

// Full randomization mode - uses actual slider values without reductions
const FULL_RANDOMIZATION = true;

// NOTE: UI colors (background, panel, border) are always derived from one of
// the 4 bloom palette colors for better visual cohesion
// ============================================================================

export const ThemeBuilder: React.FC<ThemeBuilderProps> = ({
  initialData,
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<ThemeFormData>(
    initialData || getDefaultThemeFormData()
  );
  const [isSaving, setIsSaving] = useState(false);
  const [activeBloomTab, setActiveBloomTab] = useState<'primary' | 'secondary' | 'tertiary' | 'quaternary'>('primary');
  const [expandedSections, setExpandedSections] = useState<{
    details: boolean;
    palette: boolean;
    bloom: boolean;
    style: boolean;
  }>({
    details: true,
    palette: false,
    bloom: false,
    style: false,
  });

  const [baseHue, setBaseHue] = useState(180);
  const [baseSaturation, setBaseSaturation] = useState(65);
  const [baseLightness, setBaseLightness] = useState(50);
  const [selectedHarmony, setSelectedHarmony] = useState<'monochromatic' | 'complementary' | 'analogous' | 'triadic' | 'split-complementary' | 'random'>('monochromatic');

  // Preview palette colors (updates as sliders change, but doesn't apply to theme until button clicked)
  const [previewPalette, setPreviewPalette] = useState<string[]>([]);

  // Random seed to force regeneration when clicking Random harmony multiple times
  const [randomSeed, setRandomSeed] = useState(0);

  const toggleSection = (section: 'details' | 'palette' | 'bloom' | 'style') => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Auto-randomize on first load if no initialData
  useEffect(() => {
    if (!initialData) {
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

  const handleFieldChange = <K extends keyof ThemeFormData>(
    field: K,
    value: ThemeFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleColorChange = (field: keyof Pick<ThemeFormData, 'primaryColor' | 'secondaryColor' | 'tertiaryColor' | 'quaternaryColor'>) => (value: ColorValue) => {
    handleFieldChange(field, value);
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
      console.log('=== Theme DTO to be saved ===');
      console.log(JSON.stringify(dto, null, 2));
      console.log('============================');

      // TODO: Uncomment when ready to actually save
      // await onSave(dto);

      Alert.alert('Preview', 'Theme data logged to console (not saved yet)');
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save theme');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to get bloom props from current form data
  const getBloomProps = () => {
    const props: any = {
      size: 150,
      gradients: [],
    };

    // Helper to convert ColorValue to bloom props
    const convertColor = (colorValue: ColorValue, field: string) => {
      const circleProps: any = {};

      if (colorValue.type === 'solid') {
        circleProps.fill = colorValue.value;
      } else {
        props.gradients.push(colorValue.value);
        circleProps.fill = `url(#${colorValue.value.id})`;
      }

      // Add border if specified
      const borderWidth = parseInt(formData.bloomBorderWidth ?? '0');
      if (borderWidth > 0) {
        circleProps.stroke = formData.bloomBorderColor || '#000000';
        circleProps.strokeWidth = borderWidth;
      }

      return circleProps;
    };

    props.primary = convertColor(formData.primaryColor, 'primary');
    props.secondary = convertColor(formData.secondaryColor, 'secondary');
    props.tertiary = convertColor(formData.tertiaryColor, 'tertiary');
    props.quaternary = convertColor(formData.quaternaryColor, 'quaternary');

    return props;
  };

  const getFontFamily = () => {
    switch (formData.font) {
      case 'monospace':
        return 'monospace';
      case 'serif':
        return 'Georgia';
      case 'sans-serif':
      default:
        return 'system-ui';
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
      const useColorfulText = Math.random() > 0.5; // 50% chance of colorful text

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
   * Generate background and panel colors based on constraint settings
   */
  const generateBackgroundAndPanel = (isDark: boolean, uiHue: number, uiSat: number): { backgroundColor: string; panelColor: string } => {
    if (!CONSTRAIN_BACKGROUND_PANEL) {
      // Unconstrained - use FULL lightness range (0-100%)
      const backgroundColor = chroma.hsl(uiHue, uiSat, Math.random()).hex(); // Full 0-100%

      // 40% chance panel = background
      const panelColor = Math.random() < 0.4
        ? backgroundColor
        : chroma.hsl(uiHue, uiSat, Math.random()).hex(); // Full 0-100%

      return { backgroundColor, panelColor };
    }

    // Constrained - use specified ranges
    const backgroundColor = isDark
      ? chroma.hsl(uiHue, uiSat, DARK_BG_RANGE.min + Math.random() * (DARK_BG_RANGE.max - DARK_BG_RANGE.min)).hex()
      : chroma.hsl(uiHue, uiSat, LIGHT_BG_RANGE.min + Math.random() * (LIGHT_BG_RANGE.max - LIGHT_BG_RANGE.min)).hex();

    // 40% chance panel = background, otherwise use panel range
    const panelColor = Math.random() < 0.4
      ? backgroundColor
      : isDark
        ? chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.05), DARK_PANEL_RANGE.min + Math.random() * (DARK_PANEL_RANGE.max - DARK_PANEL_RANGE.min)).hex()
        : chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.05), LIGHT_PANEL_RANGE.min + Math.random() * (LIGHT_PANEL_RANGE.max - LIGHT_PANEL_RANGE.min)).hex();

    return { backgroundColor, panelColor };
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

    // Extract HSL from the selected bloom color
    const bloomChroma = chroma(selectedBloomColor);
    const uiHue = bloomChroma.get('hsl.h');
    const uiSat = bloomChroma.get('hsl.s');

    // Generate UI colors with more variation
    const isDark = Math.random() > 0.5;

    const { backgroundColor, panelColor } = generateBackgroundAndPanel(isDark, uiHue, uiSat);

    // Generate readable text color based on panel color (aim for AAA: 7.0, fallback to AA: 4.5)
    let textColor = getReadableTextColor(panelColor, 7.0);
    // Verify contrast - if AAA fails, try AA
    const contrast = chroma.contrast(panelColor, textColor);
    if (contrast < 4.5) {
      textColor = getReadableTextColor(panelColor, 4.5);
    }

    const borderColor = isDark
      ? chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.1), 0.2 + Math.random() * 0.15).hex() // 20-35%
      : chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.1), 0.75 + Math.random() * 0.15).hex(); // 75-90%

    // Generate bloom border color
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

    setFormData((prev) => ({
      ...prev,
      primaryColor: updateColorValue(prev.primaryColor, shuffled[0]),
      secondaryColor: updateColorValue(prev.secondaryColor, shuffled[1]),
      tertiaryColor: updateColorValue(prev.tertiaryColor, shuffled[2]),
      quaternaryColor: updateColorValue(prev.quaternaryColor, shuffled[3]),
      bloomBorderColor,
      backgroundColor,
      panelColor,
      textColor,
      borderColor,
    }));
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

  const randomizeBloom = () => {
    // Generate random bloom colors using current palette settings
    const bloomColors = generatePaletteColors(baseHue, baseSaturation, baseLightness, selectedHarmony);
    const shuffled = [...bloomColors].sort(() => Math.random() - 0.5);

    // Helper to maybe create a gradient (25% chance)
    const maybeGradient = (baseColor: string, index: number): ColorValue => {
      if (Math.random() < 0.25) {
        // Create a gradient with 2 stops
        const angle = Math.floor(Math.random() * 360);

        // Vary the base color slightly for gradient stops
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();

        return {
          type: 'gradient',
          value: {
            id: `bloom-gradient-${index}-${Date.now()}`,
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

    // 25% chance to use black, otherwise pick a color from palette and darken it
    let bloomBorderColor: string;
    if (Math.random() < 0.25) {
      bloomBorderColor = '#000000';
    } else {
      const borderBaseColor = chroma(shuffled[Math.floor(Math.random() * 4)]);
      bloomBorderColor = borderBaseColor.darken(0.5 + Math.random() * 0.5).hex(); // Darken by 0.5-1
    }

    // Randomize border width (0-40, with bias toward 0)
    const bloomBorderWidth = Math.random() < 0.3 ? '0' : Math.floor(Math.random() * 41).toString();

    setFormData({
      ...formData,
      primaryColor: maybeGradient(shuffled[0], 0),
      secondaryColor: maybeGradient(shuffled[1], 1),
      tertiaryColor: maybeGradient(shuffled[2], 2),
      quaternaryColor: maybeGradient(shuffled[3], 3),
      bloomBorderColor,
      bloomBorderWidth,
    });
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
    // Pick a random bloom color to derive UI colors from
    const bloomColors = [
      getBloomColor(formData.primaryColor),
      getBloomColor(formData.secondaryColor),
      getBloomColor(formData.tertiaryColor),
      getBloomColor(formData.quaternaryColor),
    ];
    const selectedBloomColor = bloomColors[Math.floor(Math.random() * 4)];

    // Extract HSL from the selected bloom color
    const bloomChroma = chroma(selectedBloomColor);
    const uiHue = bloomChroma.get('hsl.h');
    const uiSat = bloomChroma.get('hsl.s');

    const isDark = Math.random() > 0.5;

    const { backgroundColor, panelColor } = generateBackgroundAndPanel(isDark, uiHue, uiSat);

    // Generate readable text color based on panel color (aim for AAA: 7.0, fallback to AA: 4.5)
    let textColor = getReadableTextColor(panelColor, 7.0);
    const contrast = chroma.contrast(panelColor, textColor);
    if (contrast < 4.5) {
      textColor = getReadableTextColor(panelColor, 4.5);
    }

    const borderColor = isDark
      ? chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.1), 0.16 + Math.random() * 0.08).hex()
      : chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.1), 0.76 + Math.random() * 0.08).hex();

    const fonts = ['sans-serif', 'serif', 'monospace'];
    const randomFont = fonts[Math.floor(Math.random() * fonts.length)];

    const borderStyles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const randomBorderStyle = borderStyles[Math.floor(Math.random() * borderStyles.length)];

    setFormData((prev) => ({
      ...prev,
      borderWidth: Math.floor(Math.random() * 6).toString(),
      borderRadius: Math.floor(Math.random() * 31).toString(),
      borderStyle: randomBorderStyle,
      borderColor,
      backgroundColor,
      panelColor,
      textColor,
      font: randomFont,
      mode: isDark ? 'dark' : 'light',
    }));
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
    const bloomChroma = chroma(selectedBloomColor);
    const uiHue = bloomChroma.get('hsl.h');
    const uiSat = bloomChroma.get('hsl.s');

    // Generate UI colors
    const isDark = Math.random() > 0.5;

    const bgPanel = generateBackgroundAndPanel(isDark, uiHue, uiSat);
    const backgroundColor = bgPanel.backgroundColor;
    const panelColor = bgPanel.panelColor;

    const borderColor = isDark
      ? chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.1), 0.2 + Math.random() * 0.15).hex()
      : chroma.hsl(uiHue, uiSat === 0 ? 0 : Math.min(1, uiSat + 0.1), 0.75 + Math.random() * 0.15).hex();

    // Generate readable text color based on panel color (aim for AAA: 7.0, fallback to AA: 4.5)
    let textColor = getReadableTextColor(panelColor, 7.0);
    const textContrast = chroma.contrast(panelColor, textColor);
    if (textContrast < 4.5) {
      textColor = getReadableTextColor(panelColor, 4.5);
    }

    // Generate bloom border
    let bloomBorderColor: string;
    if (Math.random() < 0.25) {
      bloomBorderColor = '#000000';
    } else {
      const borderBaseColor = chroma(shuffled[Math.floor(Math.random() * 4)]);
      bloomBorderColor = borderBaseColor.darken(0.5 + Math.random() * 0.5).hex();
    }
    const bloomBorderWidth = Math.random() < 0.3 ? '0' : Math.floor(Math.random() * 41).toString();

    // Helper to maybe create a gradient (25% chance)
    const maybeGradient = (baseColor: string, index: number): ColorValue => {
      if (Math.random() < 0.25) {
        // Create a gradient with 2 stops
        const angle = Math.floor(Math.random() * 360);

        // Vary the base color slightly for gradient stops
        const color1 = chroma(baseColor).brighten(0.3 + Math.random() * 0.3).hex();
        const color2 = chroma(baseColor).darken(0.3 + Math.random() * 0.3).hex();

        return {
          type: 'gradient',
          value: {
            id: `bloom-gradient-${index}-${Date.now()}`,
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

    const fonts = ['sans-serif', 'serif', 'monospace'];
    const randomFont = fonts[Math.floor(Math.random() * fonts.length)];

    const borderStyles: Array<'solid' | 'dashed' | 'dotted'> = ['solid', 'dashed', 'dotted'];
    const randomBorderStyle = borderStyles[Math.floor(Math.random() * borderStyles.length)];

    setFormData({
      ...formData,
      title,
      description,
      primaryColor: maybeGradient(shuffled[0], 0),
      secondaryColor: maybeGradient(shuffled[1], 1),
      tertiaryColor: maybeGradient(shuffled[2], 2),
      quaternaryColor: maybeGradient(shuffled[3], 3),
      bloomBorderColor,
      bloomBorderWidth,
      backgroundColor,
      panelColor,
      textColor,
      borderColor,
      borderWidth: Math.floor(Math.random() * 6).toString(),
      borderRadius: Math.floor(Math.random() * 31).toString(),
      borderStyle: randomBorderStyle,
      font: randomFont,
      mode: isDark ? 'dark' : 'light',
    });
  };

  return (
    <View style={styles.container}>
      {/* Left Side - Preview */}
      <View style={styles.leftPanel}>
        <ScrollView contentContainerStyle={styles.previewContent} style={styles.previewScroll}>
          <Text style={styles.previewTitle}>Preview</Text>

          <View
            style={[
              styles.previewContainer,
              { backgroundColor: formData.backgroundColor || '#ffffff' },
            ]}
          >
            {/* CruxBloom */}
            <View style={styles.bloomContainer}>
              <CruxBloom {...getBloomProps()} />
            </View>

            {/* Sample Panel */}
            <View
              style={[
                styles.samplePanel,
                {
                  backgroundColor: formData.panelColor || '#f5f5f5',
                  borderColor: formData.borderColor || '#cccccc',
                  borderWidth: parseInt(formData.borderWidth ?? '1'),
                  borderRadius: typeof formData.borderRadius === 'number' ? formData.borderRadius : parseInt(formData.borderRadius ?? '0'),
                  borderStyle: formData.borderStyle || 'solid',
                },
              ]}
            >
              <Text
                style={[
                  styles.sampleHeading,
                  {
                    color: formData.textColor || '#000000',
                    fontFamily: getFontFamily(),
                    fontSize: formData.font === 'monospace' ? 18 : 22,
                  },
                ]}
              >
                Lorem Ipsum Dolor Sit Amet
              </Text>
              <Text
                style={[
                  styles.sampleText,
                  {
                    color: formData.textColor || '#000000',
                    fontFamily: getFontFamily(),
                    fontSize: formData.font === 'monospace' ? 14 : 17,
                    lineHeight: formData.font === 'monospace' ? 22 : 26,
                  },
                ]}
              >
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              </Text>
              <Text
                style={[
                  styles.sampleText,
                  {
                    color: formData.textColor || '#000000',
                    fontFamily: getFontFamily(),
                    fontSize: formData.font === 'monospace' ? 14 : 17,
                    lineHeight: formData.font === 'monospace' ? 22 : 26,
                  },
                ]}
              >
                Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              </Text>
              <Text
                style={[
                  styles.sampleText,
                  {
                    color: formData.textColor || '#000000',
                    fontFamily: getFontFamily(),
                    fontSize: formData.font === 'monospace' ? 14 : 17,
                    lineHeight: formData.font === 'monospace' ? 22 : 26,
                  },
                ]}
              >
                Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
              </Text>
            </View>
          </View>
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
            onPress={randomizeDetails}
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
            onPress={handleRandomize}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.palette && (
        <>
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
          <Text style={styles.activePaletteLabel}>Palette Preview</Text>
          <View style={styles.activePaletteRow}>
            {previewPalette.length > 0 ? (
              <>
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[0] },
                  ]}
                />
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[1] },
                  ]}
                />
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[2] },
                  ]}
                />
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: previewPalette[3] },
                  ]}
                />
              </>
            ) : (
              <>
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData.primaryColor) },
                  ]}
                />
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData.secondaryColor) },
                  ]}
                />
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData.tertiaryColor) },
                  ]}
                />
                <View
                  style={[
                    styles.paletteColorBox,
                    { backgroundColor: getBloomColor(formData.quaternaryColor) },
                  ]}
                />
              </>
            )}
          </View>
        </View>

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
          onPress={handleGenerateUIColors}
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
            onPress={randomizeBloom}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.bloom && (
        <>
        <Text style={styles.sectionDescription}>
          These colors are used in the Crux bloom icon. You can use solid colors or gradients.
        </Text>

        {/* Bloom Border Controls */}
        <HexColorInput
          label="Bloom Border Color"
          value={formData.bloomBorderColor || ''}
          onChange={(value) => handleFieldChange('bloomBorderColor', value)}
          placeholder="#000000"
        />

        <View style={styles.field}>
          <Text style={styles.label}>
            Bloom Border Width: {typeof formData.bloomBorderWidth === 'number' ? formData.bloomBorderWidth : parseInt(formData.bloomBorderWidth ?? '0')}
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={75}
            step={1}
            value={typeof formData.bloomBorderWidth === 'number' ? formData.bloomBorderWidth : parseInt(formData.bloomBorderWidth ?? '0')}
            onValueChange={(val) => handleFieldChange('bloomBorderWidth', Math.round(val).toString())}
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
              { borderBottomColor: getBloomColor(formData.primaryColor) },
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
              { borderBottomColor: getBloomColor(formData.secondaryColor) },
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
              { borderBottomColor: getBloomColor(formData.tertiaryColor) },
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
              { borderBottomColor: getBloomColor(formData.quaternaryColor) },
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
              value={formData.primaryColor}
              onChange={handleColorChange('primaryColor')}
            />
          )}
          {activeBloomTab === 'secondary' && (
            <ColorPicker
              label="Secondary"
              value={formData.secondaryColor}
              onChange={handleColorChange('secondaryColor')}
            />
          )}
          {activeBloomTab === 'tertiary' && (
            <ColorPicker
              label="Tertiary"
              value={formData.tertiaryColor}
              onChange={handleColorChange('tertiaryColor')}
            />
          )}
          {activeBloomTab === 'quaternary' && (
            <ColorPicker
              label="Quaternary (Innermost)"
              value={formData.quaternaryColor}
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
            onPress={randomizeStyle}
          >
            <Text style={styles.sectionRandomizeText}>⟳</Text>
          </TouchableOpacity>
        </View>

        {expandedSections.style && (
        <>
        <Text style={styles.sectionDescription}>
          Optional styling for your app's user interface.
        </Text>

        <HexColorInput
          label="Border Color"
          value={formData.borderColor || ''}
          onChange={(value) => handleFieldChange('borderColor', value)}
          placeholder="#cccccc"
        />

        <View style={styles.field}>
          <Text style={styles.label}>
            Border Width: {typeof formData.borderWidth === 'number' ? formData.borderWidth : parseInt(formData.borderWidth ?? '1')}px
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={10}
            step={1}
            value={typeof formData.borderWidth === 'number' ? formData.borderWidth : parseInt(formData.borderWidth ?? '1')}
            onValueChange={(val) => handleFieldChange('borderWidth', Math.round(val).toString())}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>
            Border Radius: {typeof formData.borderRadius === 'number' ? formData.borderRadius : parseInt(formData.borderRadius ?? '0')}px
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={50}
            step={1}
            value={typeof formData.borderRadius === 'number' ? formData.borderRadius : parseInt(formData.borderRadius ?? '0')}
            onValueChange={(val) => handleFieldChange('borderRadius', Math.round(val).toString())}
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
                formData.borderStyle === 'solid' && styles.fontButtonActive,
              ]}
              onPress={() => handleFieldChange('borderStyle', 'solid')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData.borderStyle === 'solid' && styles.fontButtonTextActive,
                ]}
              >
                Solid
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData.borderStyle === 'dashed' && styles.fontButtonActive,
              ]}
              onPress={() => handleFieldChange('borderStyle', 'dashed')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData.borderStyle === 'dashed' && styles.fontButtonTextActive,
                ]}
              >
                Dashed
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData.borderStyle === 'dotted' && styles.fontButtonActive,
              ]}
              onPress={() => handleFieldChange('borderStyle', 'dotted')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData.borderStyle === 'dotted' && styles.fontButtonTextActive,
                ]}
              >
                Dotted
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <HexColorInput
          label="Background Color"
          value={formData.backgroundColor || ''}
          onChange={(value) => handleFieldChange('backgroundColor', value)}
          placeholder="#ffffff"
        />

        <HexColorInput
          label="Panel Color"
          value={formData.panelColor || ''}
          onChange={(value) => handleFieldChange('panelColor', value)}
          placeholder="#f5f5f5"
        />

        <HexColorInput
          label="Text Color"
          value={formData.textColor || ''}
          onChange={(value) => handleFieldChange('textColor', value)}
          placeholder="#000000"
        />

        {/* Contrast Indicator */}
        {formData.panelColor && formData.textColor && (() => {
          try {
            const ratio = chroma.contrast(formData.panelColor, formData.textColor);
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
                formData.font === 'sans-serif' && styles.fontButtonActive,
              ]}
              onPress={() => handleFieldChange('font', 'sans-serif')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData.font === 'sans-serif' && styles.fontButtonTextActive,
                ]}
              >
                Sans Serif
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData.font === 'serif' && styles.fontButtonActive,
              ]}
              onPress={() => handleFieldChange('font', 'serif')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData.font === 'serif' && styles.fontButtonTextActive,
                ]}
              >
                Serif
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.fontButton,
                formData.font === 'monospace' && styles.fontButtonActive,
              ]}
              onPress={() => handleFieldChange('font', 'monospace')}
            >
              <Text
                style={[
                  styles.fontButtonText,
                  formData.font === 'monospace' && styles.fontButtonTextActive,
                ]}
              >
                Monospace
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Mode</Text>
          <TextInput
            style={styles.input}
            value={formData.mode || ''}
            onChangeText={(value) => handleFieldChange('mode', value)}
            placeholder="e.g., light, dark, auto"
            placeholderTextColor="#666"
          />
        </View>
        </>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.randomizeAllButton]}
          onPress={randomizeAll}
          disabled={isSaving}
        >
          <Text style={styles.randomizeAllButtonText}>🎲 Randomize All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.saveButton]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <Text style={styles.buttonText}>{isSaving ? 'Saving...' : 'Save Theme'}</Text>
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
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  sampleText: {
    fontSize: 17,
    lineHeight: 26,
    marginBottom: 16,
  },
  sampleSubtext: {
    fontSize: 14,
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
});

export * from './types';
export { HexColorInput } from './HexColorInput';
export { ColorPicker } from './ColorPicker';
