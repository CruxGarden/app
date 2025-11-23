/**
 * Panel Component
 *
 * Main themed container for grouping content with panel styling
 */

import React, { useMemo } from 'react';
import { ViewProps, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

export interface PanelProps extends ViewProps {
  /** Add padding inside the panel */
  padded?: boolean;
  /** Custom padding override */
  padding?: number;
  /** Disable borders */
  noBorder?: boolean;
  /** Disable shadow */
  noShadow?: boolean;
}

export const Panel: React.FC<PanelProps> = ({
  padded = true,
  padding,
  noBorder = false,
  noShadow = false,
  style,
  children,
  ...props
}) => {
  const { tokens, transitionDuration } = useTheme();

  // Static styles (don't animate) - includes shadows
  const staticStyle: ViewStyle = useMemo(() => {
    // Build shadow styles if enabled
    const shadowStyle: ViewStyle = {};
    if (!noShadow && tokens.shadows.panel) {
      const shadow = tokens.shadows.panel;
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
      ...(padded && {
        padding: padding ?? tokens.spacing.lg,
      }),
      ...shadowStyle,
    };
  }, [tokens, noBorder, noShadow, padded, padding]);

  // Animated styles (colors and borders that change with theme)
  const animatedStyle = useAnimatedStyle(
    () => ({
      backgroundColor: withTiming(tokens.colors.panel, { duration: transitionDuration }),
      borderColor: withTiming(noBorder ? 'transparent' : tokens.colors.border, {
        duration: transitionDuration,
      }),
      borderWidth: withTiming(noBorder ? 0 : tokens.borders.width, {
        duration: transitionDuration,
      }),
      borderRadius: withTiming(tokens.borders.radius, { duration: transitionDuration }),
      // borderStyle can't be animated but will update
      borderStyle: tokens.borders.style,
    }),
    [tokens, noBorder, transitionDuration]
  );

  return (
    <Animated.View style={[staticStyle, animatedStyle, style]} {...props}>
      {children}
    </Animated.View>
  );
};
