/**
 * Panel Component
 *
 * Main themed container for grouping content with panel styling
 */

import React from 'react';
import { ViewProps, ViewStyle } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { View } from './View';

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
  const { tokens } = useTheme();

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

  const panelStyle: ViewStyle = {
    backgroundColor: tokens.colors.panel,
    ...(!noBorder && {
      borderWidth: tokens.borders.width,
      borderColor: tokens.borders.color,
      borderStyle: tokens.borders.style,
      borderRadius: tokens.borders.radius,
    }),
    ...(padded && {
      padding: padding ?? tokens.spacing.lg,
    }),
    ...shadowStyle,
  };

  return (
    <View style={[panelStyle, style]} {...props}>
      {children}
    </View>
  );
};
