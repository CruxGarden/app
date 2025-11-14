/**
 * Link Component
 *
 * Themed link with automatic color, underline style, and animated transitions
 */

import React from 'react';
import { Pressable, PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

const ANIMATION_DURATION = 300;

export interface LinkProps extends PressableProps {
  /** Link text */
  children: string;
  /** Override link color from theme */
  color?: string;
  /** Override underline style from theme */
  underlineStyle?: 'none' | 'underline' | 'always';
  /** Font variant */
  variant?: 'body' | 'heading' | 'mono';
  /** Font weight */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

export const Link: React.FC<LinkProps> = ({
  children,
  color,
  underlineStyle,
  variant = 'body',
  weight = 'regular',
  style,
  ...props
}) => {
  const { tokens } = useTheme();
  const [isHovered, setIsHovered] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

  const linkColor = color || tokens.colors.link;
  const linkUnderline = underlineStyle || tokens.link.underlineStyle;

  // Determine font family based on variant
  const getFontFamily = () => {
    let baseFontFamily: 'sans' | 'serif' | 'mono';

    if (variant === 'mono') {
      baseFontFamily = 'mono';
    } else if (variant === 'heading') {
      const headingFont = tokens.typography.fontFamily.heading;
      if (headingFont.includes('Serif')) {
        baseFontFamily = 'serif';
      } else if (headingFont.includes('Mono')) {
        baseFontFamily = 'mono';
      } else {
        baseFontFamily = 'sans';
      }
    } else {
      const bodyFont = tokens.typography.fontFamily.body;
      if (bodyFont.includes('Serif')) {
        baseFontFamily = 'serif';
      } else if (bodyFont.includes('Mono')) {
        baseFontFamily = 'mono';
      } else {
        baseFontFamily = 'sans';
      }
    }

    // Apply weight
    if (baseFontFamily === 'mono') {
      switch (weight) {
        case 'medium': return 'IBMPlexMono_500Medium';
        case 'semibold': return 'IBMPlexMono_600SemiBold';
        case 'bold': return 'IBMPlexMono_700Bold';
        default: return 'IBMPlexMono_400Regular';
      }
    } else if (baseFontFamily === 'serif') {
      switch (weight) {
        case 'medium': return 'IBMPlexSerif_500Medium';
        case 'semibold': return 'IBMPlexSerif_600SemiBold';
        case 'bold': return 'IBMPlexSerif_700Bold';
        default: return 'IBMPlexSerif_400Regular';
      }
    } else {
      switch (weight) {
        case 'medium': return 'IBMPlexSans_500Medium';
        case 'semibold': return 'IBMPlexSans_600SemiBold';
        case 'bold': return 'IBMPlexSans_700Bold';
        default: return 'IBMPlexSans_400Regular';
      }
    }
  };

  const fontSize = variant === 'heading'
    ? tokens.typography.fontSize.heading
    : tokens.typography.fontSize.body;

  // Determine underline visibility
  const showUnderline = linkUnderline === 'always' || (linkUnderline === 'underline' && isHovered);

  const animatedStyle = useAnimatedStyle(() => ({
    color: withTiming(linkColor, { duration: ANIMATION_DURATION }),
    opacity: withTiming(isPressed ? 0.7 : 1, { duration: 100 }),
    textDecorationLine: showUnderline ? 'underline' : 'none',
    textDecorationColor: linkColor,
  }));

  return (
    <Pressable
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      {...props}
    >
      <Animated.Text
        style={[
          {
            fontFamily: getFontFamily(),
            fontSize,
            lineHeight: tokens.typography.lineHeight,
          },
          animatedStyle,
          style,
        ]}
      >
        {children}
      </Animated.Text>
    </Pressable>
  );
};
