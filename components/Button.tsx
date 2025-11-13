/**
 * Button Component
 *
 * Simple button with automatic theming and variants
 */

import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, ActivityIndicator } from 'react-native';
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
    backgroundColor: isGhost
      ? 'transparent'
      : isPrimary
      ? tokens.colors.buttonBackground
      : tokens.colors.panel,
    borderWidth: isGhost ? 0 : tokens.button.borderWidth,
    borderColor: isGhost
      ? 'transparent'
      : isPrimary
      ? tokens.colors.buttonBorder
      : tokens.colors.border,
    borderRadius: tokens.button.borderRadius,
    borderStyle: tokens.button.borderStyle as 'solid' | 'dashed' | 'dotted',
    paddingVertical: tokens.spacing.sm + 4,
    paddingHorizontal: tokens.spacing.md + 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    opacity: disabled ? 0.5 : 1,
    minWidth: 100,
    ...(fullWidth && { width: '100%' }),
  };

  const textColor = isPrimary
    ? tokens.colors.buttonText
    : isGhost
    ? tokens.colors.link
    : tokens.colors.text;

  return (
    <TouchableOpacity
      style={[buttonStyle, style]}
      disabled={disabled || loading}
      {...props}
    >
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
    </TouchableOpacity>
  );
};
