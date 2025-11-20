/**
 * Loading Component
 *
 * Centered activity indicator with theme color
 */

import React from 'react';
import { ActivityIndicator, ActivityIndicatorProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { View } from './View';

export interface LoadingProps extends Omit<ActivityIndicatorProps, 'color'> {
  /** Override color from theme */
  color?: string;
  /** Center in container */
  centered?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({
  color,
  centered = true,
  size = 'large',
  ...props
}) => {
  const { tokens } = useTheme();

  const indicator = (
    <ActivityIndicator
      color={color || tokens.colors.primary}
      size={size}
      {...props}
    />
  );

  if (centered) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {indicator}
      </View>
    );
  }

  return indicator;
};
