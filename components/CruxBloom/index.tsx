import React from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

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

export interface CruxBloomProps {
  /** Width of the SVG viewBox (default: 2000) */
  width?: number;
  /** Height of the SVG viewBox (default: 2000) */
  height?: number;
  /** Size multiplier for responsive scaling */
  size?: number;
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
  primary,
  secondary,
  tertiary,
  quaternary,
  gradients = [],
  style,
  testID = 'crux-bloom',
}) => {
  // Merge custom styles with defaults
  const c1 = { ...defaultPrimary, ...primary };
  const c2 = { ...defaultSecondary, ...secondary };
  const c3 = { ...defaultTertiary, ...tertiary };
  const c4 = { ...defaultQuaternary, ...quaternary };

  // Calculate center point
  const centerX = width / 2;
  const centerY = height / 2;

  // Calculate the bounding box needed for all circles
  const circles = [
    { ...c1, radius: CIRCLE_RADII[0], offsetY: CIRCLE_OFFSETS[0] },
    { ...c2, radius: CIRCLE_RADII[1], offsetY: CIRCLE_OFFSETS[1] },
    { ...c3, radius: CIRCLE_RADII[2], offsetY: CIRCLE_OFFSETS[2] },
    { ...c4, radius: CIRCLE_RADII[3], offsetY: CIRCLE_OFFSETS[3] },
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

  // Helper to calculate gradient coordinates based on angle
  const getGradientCoords = (angle: number = 90) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x1: `${50 - 50 * Math.cos(rad)}%`,
      y1: `${50 - 50 * Math.sin(rad)}%`,
      x2: `${50 + 50 * Math.cos(rad)}%`,
      y2: `${50 + 50 * Math.sin(rad)}%`,
    };
  };

  return (
    <Svg
      width={actualWidth}
      height={actualHeight}
      viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
      style={style}
      testID={testID}
    >
      {/* Gradient Definitions */}
      {gradients.length > 0 && (
        <Defs>
          {gradients.map((gradient) => {
            const coords = getGradientCoords(gradient.angle);
            return (
              <LinearGradient
                key={gradient.id}
                id={gradient.id}
                x1={coords.x1}
                y1={coords.y1}
                x2={coords.x2}
                y2={coords.y2}
              >
                {gradient.stops.map((stop, idx) => (
                  <Stop
                    key={idx}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity ?? 1}
                  />
                ))}
              </LinearGradient>
            );
          })}
        </Defs>
      )}

      {/* Four Circles */}
      <Circle
        cx={centerX}
        cy={centerY + circles[0].offsetY}
        r={circles[0].radius}
        fill={c1.fill}
        stroke={c1.stroke}
        strokeWidth={c1.strokeWidth}
        opacity={c1.opacity}
      />
      <Circle
        cx={centerX}
        cy={centerY + circles[1].offsetY}
        r={circles[1].radius}
        fill={c2.fill}
        stroke={c2.stroke}
        strokeWidth={c2.strokeWidth}
        opacity={c2.opacity}
      />
      <Circle
        cx={centerX}
        cy={centerY + circles[2].offsetY}
        r={circles[2].radius}
        fill={c3.fill}
        stroke={c3.stroke}
        strokeWidth={c3.strokeWidth}
        opacity={c3.opacity}
      />
      <Circle
        cx={centerX}
        cy={centerY + circles[3].offsetY}
        r={circles[3].radius}
        fill={c4.fill}
        stroke={c4.stroke}
        strokeWidth={c4.strokeWidth}
        opacity={c4.opacity}
      />
    </Svg>
  );
};

export default CruxBloom;
