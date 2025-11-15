/**
 * Themed TextInput Component
 *
 * Drop-in replacement for React Native TextInput with automatic theme support and animated transitions
 */

import React, { useMemo } from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

export interface TextInputProps extends RNTextInputProps {
  /** Override text color from theme */
  color?: string;
  /** Override background color from theme */
  backgroundColor?: string;
  /** Override border color from theme */
  borderColor?: string;
}

const AnimatedTextInput = Animated.createAnimatedComponent(RNTextInput);

export const TextInput: React.FC<TextInputProps> = ({
  style,
  color,
  backgroundColor,
  borderColor,
  placeholderTextColor,
  selectionColor,
  ...props
}) => {
  const { tokens, transitionDuration } = useTheme();

  const inputStyle = useMemo(() => {
    // Determine font family from theme
    const bodyFont = tokens.typography.fontFamily.body;
    let fontFamily: string;

    if (bodyFont.includes('Serif')) {
      fontFamily = 'IBMPlexSerif_400Regular';
    } else if (bodyFont.includes('Mono')) {
      fontFamily = 'IBMPlexMono_400Regular';
    } else {
      fontFamily = 'IBMPlexSans_400Regular';
    }

    return {
      borderWidth: tokens.borders.width,
      borderRadius: tokens.borders.radius,
      borderStyle: tokens.borders.style as 'solid' | 'dotted' | 'dashed',
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      fontFamily,
      fontSize: tokens.typography.fontSize.body,
    };
  }, [tokens]);

  const animatedStyle = useAnimatedStyle(() => ({
    color: withTiming(color || tokens.colors.text, { duration: transitionDuration }),
    backgroundColor: withTiming(backgroundColor || tokens.colors.panel, { duration: transitionDuration }),
    borderColor: withTiming(borderColor || tokens.colors.border, { duration: transitionDuration }),
  }), [color, tokens.colors.text, tokens.colors.panel, tokens.colors.border, backgroundColor, borderColor, transitionDuration]);

  return (
    <AnimatedTextInput
      style={[inputStyle, animatedStyle, style]}
      placeholderTextColor={placeholderTextColor || tokens.colors.text + '80'} // 50% opacity
      selectionColor={selectionColor || tokens.colors.selection}
      {...props}
    />
  );
};
