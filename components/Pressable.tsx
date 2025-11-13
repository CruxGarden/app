/**
 * Themed Pressable Component
 *
 * Drop-in replacement for React Native Pressable with automatic theme support
 */

import React from 'react';
import { Pressable as RNPressable, PressableProps as RNPressableProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export interface PressableProps extends RNPressableProps {
  /** Override background color from theme */
  backgroundColor?: string;
  /** Use button background color */
  variant?: 'default' | 'button' | 'panel';
}

export const Pressable: React.FC<PressableProps> = ({
  style,
  backgroundColor,
  variant = 'default',
  ...props
}) => {
  const { tokens } = useTheme();

  const defaultBackgroundColor = backgroundColor ||
    (variant === 'button' ? tokens.colors.buttonBackground :
     variant === 'panel' ? tokens.colors.panel :
     'transparent');

  return (
    <RNPressable
      style={(state) => [
        { backgroundColor: defaultBackgroundColor },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    />
  );
};
