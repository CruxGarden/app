/**
 * ThemePreview Component
 *
 * Displays a visual preview of a theme with bloom and color swatches
 */

import React from 'react';
import { View, Text } from '@/components';
import { CruxBloom } from '@/components/CruxBloom';
import { computeDesignTokens, type Theme } from '@/utils/designTokens';
import { useTheme } from '@/contexts/ThemeContext';

export interface ThemePreviewProps {
  /** Theme to preview */
  theme: Theme;
  /** Size of the preview (default: 'medium') */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show title and description */
  showDetails?: boolean;
  /** Custom style for container */
  style?: any;
}

// Helper to map font family to actual Expo font names
const mapFontFamily = (fontFamily: string): string => {
  // Map internal font names to Expo font names
  const fontMap: { [key: string]: string } = {
    'IBMPlexSans-Regular': 'IBMPlexSans_400Regular',
    'IBMPlexSans-SemiBold': 'IBMPlexSans_600SemiBold',
    'IBMPlexSerif-Regular': 'IBMPlexSerif_400Regular',
    'IBMPlexSerif-SemiBold': 'IBMPlexSerif_600SemiBold',
    'IBMPlexMono-Regular': 'IBMPlexMono_400Regular',
    'IBMPlexMono-SemiBold': 'IBMPlexMono_600SemiBold',
  };
  return fontMap[fontFamily] || fontFamily;
};

export const ThemePreview: React.FC<ThemePreviewProps> = ({
  theme,
  size = 'medium',
  showDetails = true,
  style,
}) => {
  const { resolvedMode } = useTheme();

  // Compute tokens from the passed theme (not the active theme)
  const tokens = computeDesignTokens(theme, resolvedMode);

  // Size values in pixels
  const bloomSize = size === 'small' ? 60 : size === 'medium' ? 100 : 150;
  const containerSize = size === 'small' ? 80 : size === 'medium' ? 120 : 180;


  return (
    <View style={style}>
      {/* Bloom Preview on theme background with themed border */}
      <View
        backgroundColor={tokens.colors.background}
        style={{
          width: containerSize,
          height: containerSize,
          borderRadius: 8,
          borderWidth: tokens.borders.width,
          borderColor: tokens.colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: showDetails ? tokens.spacing.sm : 0,
        }}
      >
        <CruxBloom
          size={bloomSize}
          theme={{
            primary: tokens.colors.bloomPrimary,
            secondary: tokens.colors.bloomSecondary,
            tertiary: tokens.colors.bloomTertiary,
            quaternary: tokens.colors.bloomQuaternary,
            borderColor: tokens.colors.bloomBorder,
            borderWidth: tokens.bloom.borderWidth,
          }}
          transitionDuration={0}
        />
      </View>

      {/* Theme Details - using themed text color and font */}
      {showDetails && (
        <View>
          <Text
            color={tokens.colors.text}
            style={{
              fontFamily: mapFontFamily(tokens.typography.fontFamily.heading),
              fontSize: size === 'small' ? 12 : size === 'medium' ? 14 : 16,
              fontWeight: '600',
              marginBottom: 4,
            }}
          >
            {theme.title}
          </Text>
          {theme.description && size !== 'small' && (
            <Text
              color={tokens.colors.text}
              style={{
                fontFamily: mapFontFamily(tokens.typography.fontFamily.body),
                fontSize: size === 'medium' ? 11 : 13,
                opacity: 0.7,
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {theme.description}
            </Text>
          )}
          {(theme.kind === 'system' || (theme as any).system === true) && (
            <Text
              color={tokens.colors.text}
              style={{
                fontFamily: mapFontFamily(tokens.typography.fontFamily.body),
                fontSize: size === 'small' ? 10 : 11,
                opacity: 0.5,
                fontStyle: 'italic',
              }}
            >
              System Theme
            </Text>
          )}
        </View>
      )}
    </View>
  );
};
