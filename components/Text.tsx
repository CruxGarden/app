/**
 * Themed Text Component
 *
 * Drop-in replacement for React Native Text with automatic theme support
 */

import React, { useMemo } from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
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
  const { tokens } = useTheme();

  const textStyle = useMemo(() => {
    let fontFamily: string;

    // Determine font family based on variant and weight
    if (variant === 'mono') {
      switch (weight) {
        case 'medium': fontFamily = 'IBMPlexMono_500Medium'; break;
        case 'semibold': fontFamily = 'IBMPlexMono_600SemiBold'; break;
        case 'bold': fontFamily = 'IBMPlexMono_700Bold'; break;
        default: fontFamily = 'IBMPlexMono_400Regular';
      }
    } else if (variant === 'heading') {
      switch (weight) {
        case 'regular': fontFamily = 'IBMPlexSans_400Regular'; break;
        case 'medium': fontFamily = 'IBMPlexSans_500Medium'; break;
        case 'bold': fontFamily = 'IBMPlexSans_700Bold'; break;
        default: fontFamily = 'IBMPlexSans_600SemiBold'; // Headings default to semibold
      }
    } else {
      // Body text
      switch (weight) {
        case 'medium': fontFamily = 'IBMPlexSans_500Medium'; break;
        case 'semibold': fontFamily = 'IBMPlexSans_600SemiBold'; break;
        case 'bold': fontFamily = 'IBMPlexSans_700Bold'; break;
        default: fontFamily = 'IBMPlexSans_400Regular';
      }
    }

    const fontSize = variant === 'heading'
      ? tokens.typography.fontSize.heading
      : tokens.typography.fontSize.body;

    return {
      color: color || tokens.colors.text,
      fontFamily,
      fontSize,
      lineHeight: tokens.typography.lineHeight,
    };
  }, [color, variant, weight, tokens]);

  return <RNText style={[textStyle, style]} {...props} />;
};
