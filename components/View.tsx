/**
 * Themed View Component
 *
 * Drop-in replacement for React Native View with automatic theme support
 */

import React from 'react';
import { View as RNView, ViewProps as RNViewProps } from 'react-native';
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

  return <RNView style={[{ backgroundColor: defaultBackgroundColor }, style]} {...props} />;
};
