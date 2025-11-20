/**
 * Themed ScrollView Component
 *
 * Drop-in replacement for React Native ScrollView with automatic theme support
 */

import React from 'react';
import { ScrollView as RNScrollView, ScrollViewProps as RNScrollViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export interface ScrollViewProps extends RNScrollViewProps {
  /** Override background color from theme */
  backgroundColor?: string;
  /** Use panel color instead of background */
  variant?: 'default' | 'panel';
}

export const ScrollView: React.FC<ScrollViewProps> = ({
  style,
  backgroundColor,
  variant = 'default',
  ...props
}) => {
  const { tokens } = useTheme();

  const defaultBackgroundColor = backgroundColor ||
    (variant === 'panel' ? tokens.colors.panel : tokens.colors.background);

  return <RNScrollView style={[{ backgroundColor: defaultBackgroundColor }, style]} {...props} />;
};
