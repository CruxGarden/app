/**
 * Button Component
 *
 * Simple button with automatic theming, variants, and animated transitions
 */

import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, ActivityIndicator } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from './Text';

export interface ButtonProps extends TouchableOpacityProps {
  /** Button text */
  title: string;
  /** Button variant */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Show loading spinner */
  loading?: boolean;
  /** Full width button */
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}) => {
  const { tokens } = useTheme();

  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';

  const buttonStyle = {
    borderWidth: isGhost ? 0 : tokens.button.borderWidth,
    borderRadius: tokens.button.borderRadius,
    borderStyle: tokens.button.borderStyle as 'solid' | 'dashed' | 'dotted',
    paddingVertical: tokens.spacing.sm + 4,
    paddingHorizontal: tokens.spacing.md + 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: disabled ? 0.5 : 1,
    minWidth: 100,
  };

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(
      isGhost
        ? 'transparent'
        : isPrimary
        ? tokens.colors.buttonBackground
        : tokens.colors.panel,
      { duration: 300 }
    ),
    borderColor: withTiming(
      isGhost
        ? 'transparent'
        : isPrimary
        ? tokens.colors.buttonBorder
        : tokens.colors.border,
      { duration: 300 }
    ),
  }));

  const textColor = isPrimary
    ? tokens.colors.buttonText
    : isGhost
    ? tokens.colors.link
    : tokens.colors.text;

  return (
    <TouchableOpacity disabled={disabled || loading} {...props}>
      <Animated.View style={[buttonStyle, animatedStyle, fullWidth && { width: '100%' }, style]}>
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <Text
            weight="semibold"
            style={{
              color: textColor,
              fontSize: tokens.typography.fontSize.control,
            }}
          >
            {title}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};
