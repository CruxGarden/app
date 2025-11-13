/**
 * Themed View Component
 *
 * Drop-in replacement for React Native View with automatic theme support and animated transitions
 */

import React from 'react';
import { ViewProps as RNViewProps } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

export interface ViewProps extends RNViewProps {
  /** Override background color from theme */
  backgroundColor?: string;
  /** Use panel color instead of background */
  variant?: 'default' | 'panel';
}

export const View: React.FC<ViewProps> = ({
  style,
  backgroundColor,
  variant = 'default',
  ...props
}) => {
  const { tokens } = useTheme();

  const defaultBackgroundColor = backgroundColor ||
    (variant === 'panel' ? tokens.colors.panel : tokens.colors.background);

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(defaultBackgroundColor, { duration: 300 }),
  }));

  return <Animated.View style={[animatedStyle, style]} {...props} />;
};
