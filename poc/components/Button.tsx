/**
 * Button Component
 *
 * Simple button with automatic theming, variants, and animated transitions
 */

import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  View,
  StyleSheet,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from './Text';
import type { ColorValue } from '@/components/ThemeBuilder';

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
  const { tokens, transitionDuration } = useTheme();

  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isGhost = variant === 'ghost';

  // Determine background color/gradient - always use gradient structure
  const backgroundColorValue: ColorValue = isPrimary
    ? tokens.colors.buttonBackground
    : { type: 'solid', value: isGhost ? 'transparent' : tokens.colors.panel };

  // Convert solid colors to gradient format (same color for both stops)
  const gradientData =
    backgroundColorValue.type === 'gradient'
      ? backgroundColorValue.value
      : {
          id: 'solid',
          angle: 0,
          stops: [
            { color: backgroundColorValue.value, offset: '0%' },
            { color: backgroundColorValue.value, offset: '100%' },
          ],
        };

  const buttonStyle = useMemo(() => {
    // Build shadow styles if enabled
    const shadowStyle: any = {};
    if (tokens.shadows.button) {
      const shadow = tokens.shadows.button;
      shadowStyle.shadowColor = shadow.color;
      shadowStyle.shadowOffset = {
        width: shadow.offsetX,
        height: shadow.offsetY,
      };
      shadowStyle.shadowOpacity = shadow.opacity;
      shadowStyle.shadowRadius = shadow.blurRadius;
      // Android elevation (approximate based on shadow)
      shadowStyle.elevation = Math.max(shadow.offsetY, shadow.blurRadius / 2);
    }

    return {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      opacity: disabled ? 0.5 : 1,
      minWidth: 100,
      overflow: 'hidden' as const, // Clip gradient to border radius
      ...shadowStyle,
    };
  }, [tokens, disabled]);

  const animatedStyle = useAnimatedStyle(
    () => ({
      borderWidth: withTiming(isGhost ? 0 : tokens.button.borderWidth, {
        duration: transitionDuration,
      }),
      borderRadius: withTiming(tokens.button.borderRadius, { duration: transitionDuration }),
      borderColor: withTiming(
        isGhost ? 'transparent' : isPrimary ? tokens.colors.buttonBorder : tokens.colors.border,
        { duration: transitionDuration }
      ),
      // Note: borderStyle can't be animated in React Native, but it will update
      borderStyle: tokens.button.borderStyle as 'solid' | 'dashed' | 'dotted',
    }),
    [isGhost, isPrimary, tokens, transitionDuration]
  );

  // Animated text color
  const textColor = isPrimary
    ? tokens.colors.buttonText
    : isGhost
      ? tokens.colors.link
      : tokens.colors.text;

  // Map theme font to actual font family with semibold weight
  const getFontFamily = () => {
    const headingFont = tokens.typography.fontFamily.heading;
    if (headingFont.includes('Serif')) {
      return 'IBMPlexSerif_600SemiBold';
    } else if (headingFont.includes('Mono')) {
      return 'IBMPlexMono_600SemiBold';
    }
    return 'IBMPlexSans_600SemiBold';
  };

  const textAnimatedStyle = useAnimatedStyle(
    () => ({
      color: withTiming(textColor, { duration: transitionDuration }),
    }),
    [textColor, transitionDuration]
  );

  const contentStyle = {
    paddingVertical: tokens.spacing.sm + 4,
    paddingHorizontal: tokens.spacing.md + 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  // Calculate gradient coordinates from angle
  const angleInRadians = ((gradientData.angle || 0) - 90) * (Math.PI / 180);
  const gradientCoords = {
    start: {
      x: 0.5 + Math.cos(angleInRadians) * 0.5,
      y: 0.5 + Math.sin(angleInRadians) * 0.5,
    },
    end: {
      x: 0.5 - Math.cos(angleInRadians) * 0.5,
      y: 0.5 - Math.sin(angleInRadians) * 0.5,
    },
  };

  // Extract colors from gradient stops
  const gradientColors = gradientData.stops.map((stop) => stop.color) as [
    string,
    string,
    ...string[],
  ];

  return (
    <TouchableOpacity disabled={disabled || loading} {...props}>
      <Animated.View style={[buttonStyle, animatedStyle, fullWidth && { width: '100%' }, style]}>
        {/* Always use gradient - solid colors become gradient with matching stops */}
        <LinearGradient
          colors={gradientColors}
          start={gradientCoords.start}
          end={gradientCoords.end}
          style={StyleSheet.absoluteFill}
        />

        {/* Content */}
        <View style={contentStyle}>
          {loading ? (
            <ActivityIndicator color={textColor} size="small" />
          ) : (
            <Animated.Text
              style={[
                {
                  fontFamily: getFontFamily(),
                  fontSize: tokens.typography.fontSize.control,
                },
                textAnimatedStyle,
              ]}
            >
              {title}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};
