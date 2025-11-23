/**
 * Themed Text Component
 *
 * Drop-in replacement for React Native Text with automatic theme support and animated transitions
 */

import React, { useMemo } from 'react';
import { TextProps as RNTextProps } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

export interface TextProps extends RNTextProps {
  /** Override text color from theme */
  color?: string;
  /** Text variant (affects font family and size) */
  variant?: 'body' | 'heading' | 'mono';
  /** Font weight */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

export const Text: React.FC<TextProps> = ({
  style,
  color,
  variant = 'body',
  weight = 'regular',
  ...props
}) => {
  const { tokens, transitionDuration } = useTheme();

  const textStyle = useMemo(() => {
    let fontFamily: string;

    // Determine which font family to use based on variant and theme
    // The theme tokens return names like 'IBMPlexSans-Regular', 'IBMPlexSerif-Regular', etc.
    // We need to map these to the actual loaded Expo font names like 'IBMPlexSans_400Regular'

    // Determine base font family from theme
    let baseFontFamily: 'sans' | 'serif' | 'mono';

    if (variant === 'mono') {
      baseFontFamily = 'mono';
    } else if (variant === 'heading') {
      // Check theme's heading font family
      const headingFont = tokens.typography.fontFamily.heading;
      if (headingFont.includes('Serif')) {
        baseFontFamily = 'serif';
      } else if (headingFont.includes('Mono')) {
        baseFontFamily = 'mono';
      } else {
        baseFontFamily = 'sans';
      }
    } else {
      // Body text - check theme's body font family
      const bodyFont = tokens.typography.fontFamily.body;
      if (bodyFont.includes('Serif')) {
        baseFontFamily = 'serif';
      } else if (bodyFont.includes('Mono')) {
        baseFontFamily = 'mono';
      } else {
        baseFontFamily = 'sans';
      }
    }

    // Now apply the weight to the determined font family
    if (baseFontFamily === 'mono') {
      switch (weight) {
        case 'medium':
          fontFamily = 'IBMPlexMono_500Medium';
          break;
        case 'semibold':
          fontFamily = 'IBMPlexMono_600SemiBold';
          break;
        case 'bold':
          fontFamily = 'IBMPlexMono_700Bold';
          break;
        default:
          fontFamily = 'IBMPlexMono_400Regular';
      }
    } else if (baseFontFamily === 'serif') {
      switch (weight) {
        case 'regular':
          fontFamily = 'IBMPlexSerif_400Regular';
          break;
        case 'medium':
          fontFamily = 'IBMPlexSerif_500Medium';
          break;
        case 'semibold':
          fontFamily = 'IBMPlexSerif_600SemiBold';
          break;
        case 'bold':
          fontFamily = 'IBMPlexSerif_700Bold';
          break;
        default:
          fontFamily =
            variant === 'heading' ? 'IBMPlexSerif_600SemiBold' : 'IBMPlexSerif_400Regular';
      }
    } else {
      // Sans-serif
      switch (weight) {
        case 'regular':
          fontFamily = 'IBMPlexSans_400Regular';
          break;
        case 'medium':
          fontFamily = 'IBMPlexSans_500Medium';
          break;
        case 'semibold':
          fontFamily = 'IBMPlexSans_600SemiBold';
          break;
        case 'bold':
          fontFamily = 'IBMPlexSans_700Bold';
          break;
        default:
          fontFamily = variant === 'heading' ? 'IBMPlexSans_600SemiBold' : 'IBMPlexSans_400Regular';
      }
    }

    const fontSize =
      variant === 'heading' ? tokens.typography.fontSize.heading : tokens.typography.fontSize.body;

    return {
      fontFamily,
      fontSize,
      lineHeight: tokens.typography.lineHeight,
    };
  }, [variant, weight, tokens]);

  const animatedStyle = useAnimatedStyle(
    () => ({
      color: withTiming(color || tokens.colors.text, { duration: transitionDuration }),
    }),
    [color, tokens.colors.text, transitionDuration]
  );

  return <Animated.Text style={[textStyle, animatedStyle, style]} {...props} />;
};
