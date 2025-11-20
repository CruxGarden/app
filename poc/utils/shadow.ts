/**
 * Shadow Utility
 *
 * Cross-platform shadow support for React Native (iOS, Android, Web)
 */

import { Platform, ViewStyle } from 'react-native';

export interface ShadowConfig {
  /** Shadow color (hex string) */
  color: string;
  /** X offset in pixels */
  offsetX: number;
  /** Y offset in pixels */
  offsetY: number;
  /** Blur radius in pixels */
  blurRadius: number;
  /** Opacity (0-1) */
  opacity: number;
}

/**
 * Generate cross-platform shadow styles
 *
 * - iOS: Uses shadowColor, shadowOffset, shadowOpacity, shadowRadius
 * - Android: Uses elevation (approximate based on offsetY and blurRadius)
 * - Web: React Native Web converts iOS shadow props to CSS box-shadow
 *
 * @param config Shadow configuration
 * @returns ViewStyle object with platform-specific shadow properties
 */
export function getShadowStyle(config: ShadowConfig): ViewStyle {
  const { color, offsetX, offsetY, blurRadius, opacity } = config;

  // iOS and Web use the same shadow properties
  // React Native Web automatically converts these to CSS box-shadow
  const iosShadow: ViewStyle = {
    shadowColor: color,
    shadowOffset: {
      width: offsetX,
      height: offsetY,
    },
    shadowOpacity: opacity,
    shadowRadius: blurRadius,
  };

  // Android uses elevation
  // We approximate elevation based on the offsetY and blurRadius
  // This is a rough approximation - Android elevation doesn't support all shadow features
  const androidShadow: ViewStyle = {
    elevation: Math.max(offsetY, blurRadius / 2),
  };

  // Return platform-specific styles
  if (Platform.OS === 'android') {
    return androidShadow;
  }

  return iosShadow;
}

/**
 * Generate shadow style from theme string values
 *
 * Convenience function that parses string values from theme data
 *
 * @param enabled Whether shadow is enabled
 * @param color Shadow color (hex string)
 * @param offsetX X offset as string
 * @param offsetY Y offset as string
 * @param blurRadius Blur radius as string
 * @param opacity Opacity as string (0-1)
 * @returns ViewStyle object with shadow, or empty object if disabled
 */
export function getShadowStyleFromTheme(
  enabled?: boolean,
  color?: string,
  offsetX?: string,
  offsetY?: string,
  blurRadius?: string,
  opacity?: string
): ViewStyle {
  if (!enabled) {
    return {};
  }

  return getShadowStyle({
    color: color || '#000000',
    offsetX: parseFloat(offsetX || '0'),
    offsetY: parseFloat(offsetY || '0'),
    blurRadius: parseFloat(blurRadius || '0'),
    opacity: parseFloat(opacity || '0'),
  });
}
