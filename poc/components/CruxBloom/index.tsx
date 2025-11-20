import React, { useMemo } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, { useAnimatedProps, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

// Create animated versions of SVG components
const AnimatedStop = Animated.createAnimatedComponent(Stop);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export interface CircleStyle {
  /** Fill color (solid color or gradient ID reference like "url(#gradient1)") */
  fill?: string;
  /** Stroke (border) color */
  stroke?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Opacity (0-1) */
  opacity?: number;
}

export interface GradientDefinition {
  /** Unique ID for the gradient */
  id: string;
  /** Gradient stops with color and offset */
  stops: Array<{ color: string; offset: string; opacity?: number }>;
  /** Gradient angle in degrees (0 = left to right, 90 = top to bottom) */
  angle?: number;
  /** Gradient type */
  type?: 'linear' | 'radial';
}

export type ColorValue =
  | { type: 'solid'; value: string }
  | { type: 'gradient'; value: GradientDefinition };

export interface CruxBloomTheme {
  primary: ColorValue;
  secondary: ColorValue;
  tertiary: ColorValue;
  quaternary: ColorValue;
  borderColor?: string;
  borderWidth?: number;
}

export interface CruxBloomProps {
  /** Width of the SVG viewBox (default: 2000) */
  width?: number;
  /** Height of the SVG viewBox (default: 2000) */
  height?: number;
  /** Size multiplier for responsive scaling */
  size?: number;
  /** Theme object with bloom colors (defaults to theme context, can override with individual circle props) */
  theme?: CruxBloomTheme;
  /** Styles for primary circle (outermost, default r=1000) */
  primary?: CircleStyle;
  /** Styles for secondary circle (default r=750) */
  secondary?: CircleStyle;
  /** Styles for tertiary circle (default r=500) */
  tertiary?: CircleStyle;
  /** Styles for quaternary circle (innermost, default r=250) */
  quaternary?: CircleStyle;
  /** Array of gradient definitions to use in fills */
  gradients?: GradientDefinition[];
  /** Transition duration for color/style animations (0 = instant, defaults to theme context value) */
  transitionDuration?: number;
  /** Additional SVG props */
  style?: any;
  /** Test ID for testing */
  testID?: string;
}

// Fixed radii for each circle
const CIRCLE_RADII = [1000, 750, 500, 250];

// Fixed offsets for cascade effect (calculated from largest radius)
const CIRCLE_OFFSETS = [0, 137, 276, 421];

const defaultPrimary: CircleStyle = {
  fill: '#2a3d2c',
};

const defaultSecondary: CircleStyle = {
  fill: '#426046',
};

const defaultTertiary: CircleStyle = {
  fill: '#58825e',
};

const defaultQuaternary: CircleStyle = {
  fill: '#73a079',
};


/**
 * CruxBloom - A simple four-circle icon component
 *
 * This component renders the Crux Garden icon with customization options for:
 * - Individual circle colors (solid or gradient)
 * - Border styles for each circle
 * - Opacity for each circle
 *
 * @example
 * ```tsx
 * // Basic usage with defaults
 * <CruxBloom size={100} />
 *
 * // Custom colors
 * <CruxBloom
 *   size={100}
 *   primary={{ fill: '#ff0000' }}
 *   secondary={{ fill: '#00ff00' }}
 * />
 *
 * // With borders
 * <CruxBloom
 *   size={100}
 *   primary={{ fill: '#ff0000', stroke: '#ffffff', strokeWidth: 4 }}
 * />
 *
 * // With gradients
 * <CruxBloom
 *   size={100}
 *   gradients={[{
 *     id: 'sunset',
 *     stops: [
 *       { color: '#ff6b6b', offset: '0%' },
 *       { color: '#feca57', offset: '100%' }
 *     ]
 *   }]}
 *   primary={{ fill: 'url(#sunset)' }}
 * />
 * ```
 */
export const CruxBloom: React.FC<CruxBloomProps> = ({
  width = 2000,
  height = 2000,
  size = 100,
  theme,
  primary: primaryProp,
  secondary: secondaryProp,
  tertiary: tertiaryProp,
  quaternary: quaternaryProp,
  gradients: gradientsProp = [],
  transitionDuration: transitionDurationProp,
  style,
  testID = 'crux-bloom',
}) => {
  // Use theme context for theme data and transitionDuration if not explicitly provided
  const { tokens, transitionDuration: contextTransitionDuration } = useTheme();

  // Use provided theme or fall back to context theme
  const actualTheme = theme ?? {
    primary: tokens.colors.bloomPrimary,
    secondary: tokens.colors.bloomSecondary,
    tertiary: tokens.colors.bloomTertiary,
    quaternary: tokens.colors.bloomQuaternary,
    borderColor: tokens.colors.bloomBorder,
    borderWidth: tokens.bloom.borderWidth,
  };

  const transitionDuration = transitionDurationProp ?? contextTransitionDuration;

  // Convert all colors to gradient definitions (solids become gradients with matching stops)
  // This allows smooth animation between any color changes
  const gradientData = useMemo(() => {
    // Generate unique ID for this bloom instance to avoid conflicts when multiple blooms on same page
    const uniqueId = `bloom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const convertToGradient = (colorValue: ColorValue, fallback: string, colorName: string): GradientDefinition => {
      if (colorValue.type === 'gradient') {
        // Use the gradient but regenerate the ID to avoid conflicts when multiple blooms on same page
        return {
          ...colorValue.value,
          id: `${uniqueId}-${colorName}`,
        };
      }
      // Convert solid to gradient with matching stops - use unique ID per bloom instance
      return {
        id: `${uniqueId}-${colorName}`,
        angle: 0,
        stops: [
          { color: colorValue.value || fallback, offset: '0%' },
          { color: colorValue.value || fallback, offset: '100%' },
        ],
      };
    };

    if (actualTheme) {
      return {
        primary: convertToGradient(actualTheme.primary, '#2a3d2c', 'primary'),
        secondary: convertToGradient(actualTheme.secondary, '#426046', 'secondary'),
        tertiary: convertToGradient(actualTheme.tertiary, '#58825e', 'tertiary'),
        quaternary: convertToGradient(actualTheme.quaternary, '#73a079', 'quaternary'),
        borderColor: actualTheme.borderColor || undefined,
        borderWidth: actualTheme.borderWidth || 0,
      };
    }

    // Use defaults
    return {
      primary: { id: 'default', angle: 0, stops: [{ color: '#2a3d2c', offset: '0%' }, { color: '#2a3d2c', offset: '100%' }] },
      secondary: { id: 'default', angle: 0, stops: [{ color: '#426046', offset: '0%' }, { color: '#426046', offset: '100%' }] },
      tertiary: { id: 'default', angle: 0, stops: [{ color: '#58825e', offset: '0%' }, { color: '#58825e', offset: '100%' }] },
      quaternary: { id: 'default', angle: 0, stops: [{ color: '#73a079', offset: '0%' }, { color: '#73a079', offset: '100%' }] },
      borderColor: undefined,
      borderWidth: 0,
    };
  }, [actualTheme]);

  // Create animated props for gradient stops (color AND offset)
  // Primary gradient stops
  const primaryStop1Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.primary.stops[0].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.primary.stops[0].offset, { duration: transitionDuration }),
  }), [gradientData]);

  const primaryStop2Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.primary.stops[1].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.primary.stops[1].offset, { duration: transitionDuration }),
  }), [gradientData]);

  // Secondary gradient stops
  const secondaryStop1Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.secondary.stops[0].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.secondary.stops[0].offset, { duration: transitionDuration }),
  }), [gradientData]);

  const secondaryStop2Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.secondary.stops[1].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.secondary.stops[1].offset, { duration: transitionDuration }),
  }), [gradientData]);

  // Tertiary gradient stops
  const tertiaryStop1Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.tertiary.stops[0].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.tertiary.stops[0].offset, { duration: transitionDuration }),
  }), [gradientData]);

  const tertiaryStop2Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.tertiary.stops[1].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.tertiary.stops[1].offset, { duration: transitionDuration }),
  }), [gradientData]);

  // Quaternary gradient stops
  const quaternaryStop1Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.quaternary.stops[0].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.quaternary.stops[0].offset, { duration: transitionDuration }),
  }), [gradientData]);

  const quaternaryStop2Props = useAnimatedProps(() => ({
    stopColor: withTiming(gradientData.quaternary.stops[1].color, { duration: transitionDuration }),
    offset: withTiming(gradientData.quaternary.stops[1].offset, { duration: transitionDuration }),
  }), [gradientData]);

  // Create animated props for circle strokes
  // Extract values outside the worklet for proper reactivity
  const borderColor = gradientData.borderColor || '#000000';
  const borderWidth = gradientData.borderWidth || 0;

  const strokeWidthProps = useAnimatedProps(() => {
    return {
      strokeWidth: withTiming(borderWidth, { duration: transitionDuration }),
    };
  }, [borderWidth]);

  // Helper to calculate gradient coordinates as numbers (for animation)
  const getGradientCoordsNumeric = (angle: number = 90) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x1: 50 - 50 * Math.cos(rad),
      y1: 50 - 50 * Math.sin(rad),
      x2: 50 + 50 * Math.cos(rad),
      y2: 50 + 50 * Math.sin(rad),
    };
  };

  // Create animated props for gradient angles
  // Extract coords outside worklet for proper reactivity
  const primaryCoords = getGradientCoordsNumeric(gradientData.primary.angle || 0);
  const primaryGradientProps = useAnimatedProps(() => {
    return {
      x1: `${primaryCoords.x1}%`,
      y1: `${primaryCoords.y1}%`,
      x2: `${primaryCoords.x2}%`,
      y2: `${primaryCoords.y2}%`,
    };
  }, [primaryCoords]);

  const secondaryCoords = getGradientCoordsNumeric(gradientData.secondary.angle || 0);
  const secondaryGradientProps = useAnimatedProps(() => {
    return {
      x1: `${secondaryCoords.x1}%`,
      y1: `${secondaryCoords.y1}%`,
      x2: `${secondaryCoords.x2}%`,
      y2: `${secondaryCoords.y2}%`,
    };
  }, [secondaryCoords]);

  const tertiaryCoords = getGradientCoordsNumeric(gradientData.tertiary.angle || 0);
  const tertiaryGradientProps = useAnimatedProps(() => {
    return {
      x1: `${tertiaryCoords.x1}%`,
      y1: `${tertiaryCoords.y1}%`,
      x2: `${tertiaryCoords.x2}%`,
      y2: `${tertiaryCoords.y2}%`,
    };
  }, [tertiaryCoords]);

  const quaternaryCoords = getGradientCoordsNumeric(gradientData.quaternary.angle || 0);
  const quaternaryGradientProps = useAnimatedProps(() => {
    return {
      x1: `${quaternaryCoords.x1}%`,
      y1: `${quaternaryCoords.y1}%`,
      x2: `${quaternaryCoords.x2}%`,
      y2: `${quaternaryCoords.y2}%`,
    };
  }, [quaternaryCoords]);

  // Calculate center point
  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate the bounding box needed for all circles
  const circles = [
    { radius: CIRCLE_RADII[0], offsetY: CIRCLE_OFFSETS[0], strokeWidth: gradientData.borderWidth },
    { radius: CIRCLE_RADII[1], offsetY: CIRCLE_OFFSETS[1], strokeWidth: gradientData.borderWidth },
    { radius: CIRCLE_RADII[2], offsetY: CIRCLE_OFFSETS[2], strokeWidth: gradientData.borderWidth },
    { radius: CIRCLE_RADII[3], offsetY: CIRCLE_OFFSETS[3], strokeWidth: gradientData.borderWidth },
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  circles.forEach((circle) => {
    const cx = centerX;
    const cy = centerY + circle.offsetY;
    const r = circle.radius;
    const strokePadding = (circle.strokeWidth || 0) / 2;
    const extent = r + strokePadding;

    minX = Math.min(minX, cx - extent);
    maxX = Math.max(maxX, cx + extent);
    minY = Math.min(minY, cy - extent);
    maxY = Math.max(maxY, cy + extent);
  });

  // Add a small safety margin
  const margin = 10;
  minX -= margin;
  maxX += margin;
  minY -= margin;
  maxY += margin;

  // Calculate viewBox dimensions
  const viewBoxX = minX;
  const viewBoxY = minY;
  const viewBoxWidth = maxX - minX;
  const viewBoxHeight = maxY - minY;

  // Calculate actual rendered dimensions
  const scaleX = viewBoxWidth / width;
  const scaleY = viewBoxHeight / height;
  const renderScale = Math.max(scaleX, scaleY, 1);
  const actualWidth = size * renderScale;
  const actualHeight = size * renderScale;

  return (
    <Svg
      width={actualWidth}
      height={actualHeight}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      style={style}
      testID={testID}
    >
      {/* Gradient Definitions - Always use gradients with animated stops and angles */}
      <Defs>
        {/* Primary gradient - use dynamic ID */}
        <AnimatedLinearGradient
          id={gradientData.primary.id}
          animatedProps={primaryGradientProps}
        >
          <AnimatedStop animatedProps={primaryStop1Props} />
          <AnimatedStop animatedProps={primaryStop2Props} />
        </AnimatedLinearGradient>

        {/* Secondary gradient - use dynamic ID */}
        <AnimatedLinearGradient
          id={gradientData.secondary.id}
          animatedProps={secondaryGradientProps}
        >
          <AnimatedStop animatedProps={secondaryStop1Props} />
          <AnimatedStop animatedProps={secondaryStop2Props} />
        </AnimatedLinearGradient>

        {/* Tertiary gradient - use dynamic ID */}
        <AnimatedLinearGradient
          id={gradientData.tertiary.id}
          animatedProps={tertiaryGradientProps}
        >
          <AnimatedStop animatedProps={tertiaryStop1Props} />
          <AnimatedStop animatedProps={tertiaryStop2Props} />
        </AnimatedLinearGradient>

        {/* Quaternary gradient - use dynamic ID */}
        <AnimatedLinearGradient
          id={gradientData.quaternary.id}
          animatedProps={quaternaryGradientProps}
        >
          <AnimatedStop animatedProps={quaternaryStop1Props} />
          <AnimatedStop animatedProps={quaternaryStop2Props} />
        </AnimatedLinearGradient>
      </Defs>

      {/* Four Circles - Use dynamic gradient IDs from gradientData */}
      <AnimatedCircle
        cx={centerX}
        cy={centerY + circles[0].offsetY}
        r={circles[0].radius}
        fill={`url(#${gradientData.primary.id})`}
        stroke={borderColor}
        animatedProps={strokeWidthProps}
      />
      <AnimatedCircle
        cx={centerX}
        cy={centerY + circles[1].offsetY}
        r={circles[1].radius}
        fill={`url(#${gradientData.secondary.id})`}
        stroke={borderColor}
        animatedProps={strokeWidthProps}
      />
      <AnimatedCircle
        cx={centerX}
        cy={centerY + circles[2].offsetY}
        r={circles[2].radius}
        fill={`url(#${gradientData.tertiary.id})`}
        stroke={borderColor}
        animatedProps={strokeWidthProps}
      />
      <AnimatedCircle
        cx={centerX}
        cy={centerY + circles[3].offsetY}
        r={circles[3].radius}
        fill={`url(#${gradientData.quaternary.id})`}
        stroke={borderColor}
        animatedProps={strokeWidthProps}
      />
    </Svg>
  );
};

export default CruxBloom;
