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
  const { tokens, transitionDuration } = useTheme();

  // Only apply background color if explicitly set or variant is 'panel'
  const shouldApplyBackground = backgroundColor !== undefined || variant === 'panel';
  const defaultBackgroundColor =
    backgroundColor || (variant === 'panel' ? tokens.colors.panel : 'transparent');

  const animatedStyle = useAnimatedStyle(
    () => ({
      backgroundColor: withTiming(defaultBackgroundColor, { duration: transitionDuration }),
    }),
    [defaultBackgroundColor, transitionDuration]
  );

  return <Animated.View style={[animatedStyle, style]} {...props} />;
};
