/**
 * Section Component
 *
 * Grouped content with optional title
 */

import React from 'react';
import { ViewProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { View } from './View';
import { Text } from './Text';

export interface SectionProps extends ViewProps {
  /** Section title */
  title?: string;
  /** Add spacing around section */
  spaced?: boolean;
}

export const Section: React.FC<SectionProps> = ({
  title,
  spaced = true,
  style,
  children,
  ...props
}) => {
  const { tokens } = useTheme();

  const sectionStyle = {
    ...(spaced && {
      marginBottom: tokens.spacing.lg,
    }),
  };

  return (
    <View style={[sectionStyle, style]} {...props}>
      {title && (
        <Text
          variant="heading"
          weight="semibold"
          style={{
            fontSize: 18,
            marginBottom: tokens.spacing.md,
            color: tokens.colors.primary,
          }}
        >
          {title}
        </Text>
      )}
      {children}
    </View>
  );
};
