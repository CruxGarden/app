/**
 * Container Component
 *
 * Standard container with padding and centered content
 */

import React from 'react';
import { ViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { View } from './View';

export interface ContainerProps extends ViewProps {
  /** Center content vertically and horizontally */
  centered?: boolean;
  /** Add padding */
  padded?: boolean;
  /** Custom padding override */
  padding?: number;
}

export const Container: React.FC<ContainerProps> = ({
  centered = false,
  padded = true,
  padding,
  style,
  children,
  ...props
}) => {
  const { tokens } = useTheme();

  const containerStyle = {
    flex: 1,
    ...(centered && {
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    }),
    ...(padded && {
      padding: padding ?? tokens.spacing.lg,
    }),
  };

  return (
    <View style={[containerStyle, style]} {...props}>
      {children}
    </View>
  );
};
