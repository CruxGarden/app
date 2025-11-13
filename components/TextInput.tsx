/**
 * Themed TextInput Component
 *
 * Drop-in replacement for React Native TextInput with automatic theme support
 */

import React, { useMemo } from 'react';
import { TextInput as RNTextInput, TextInputProps as RNTextInputProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export interface TextInputProps extends RNTextInputProps {
  /** Override text color from theme */
  color?: string;
  /** Override background color from theme */
  backgroundColor?: string;
  /** Override border color from theme */
  borderColor?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  style,
  color,
  backgroundColor,
  borderColor,
  placeholderTextColor,
  selectionColor,
  ...props
}) => {
  const { tokens } = useTheme();

  const inputStyle = useMemo(() => ({
    color: color || tokens.colors.text,
    backgroundColor: backgroundColor || tokens.colors.panel,
    borderColor: borderColor || tokens.colors.border,
    borderWidth: tokens.borders.width,
    borderRadius: tokens.borders.radius,
    borderStyle: tokens.borders.style,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    fontFamily: 'IBMPlexSans_400Regular',
    fontSize: tokens.typography.fontSize.body,
  }), [color, backgroundColor, borderColor, tokens]);

  return (
    <RNTextInput
      style={[inputStyle, style]}
      placeholderTextColor={placeholderTextColor || tokens.colors.text + '80'} // 50% opacity
      selectionColor={selectionColor || tokens.colors.selection}
      {...props}
    />
  );
};
