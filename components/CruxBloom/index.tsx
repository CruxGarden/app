import React from 'react';
import Svg, { Circle, Polygon, Defs, LinearGradient, Stop } from 'react-native-svg';

export interface CircleStyle {
  /** Fill color (solid color or gradient ID reference like "url(#gradient1)") */
  fill?: string;
  /** Stroke (border) color */
  stroke?: string;
  /** Stroke width */
  strokeWidth?: number;
  /** Opacity (0-1) */
  opacity?: number;
  /** Horizontal offset from center */
  offsetX?: number;
  /** Vertical offset from center */
  offsetY?: number;
  /** Radius of the circle/polygon */
  radius?: number;
  /** Number of sides (undefined or 0 = circle, 3 = triangle, 4 = square, 5 = pentagon, etc.) */
  sides?: number;
  /** Rotation of the shape itself in degrees (independent of global rotation) */
  shapeRotation?: number;
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
  /** Global rotation in degrees */
  rotate?: number;
  /** Styles for circle 1 (outermost, default r=1000) */
  circle1?: CircleStyle;
  /** Styles for circle 2 (default r=750) */
  circle2?: CircleStyle;
  /** Styles for circle 3 (default r=500) */
  circle3?: CircleStyle;
  /** Styles for circle 4 (innermost, default r=250) */
  circle4?: CircleStyle;
  /** Array of gradient definitions to use in fills */
  gradients?: GradientDefinition[];
  /** Additional SVG props */
  style?: any;
  /** Test ID for testing */
  testID?: string;
}

// Base offset ratios relative to the largest radius (for scaling)
const BASE_OFFSET_RATIOS = [0, 0.137, 0.276, 0.421];

const defaultCircle1: CircleStyle = {
  fill: '#2a3d2c',
  radius: 1000,
  offsetX: 0,
  offsetY: 0, // Will be calculated based on radius
};

const defaultCircle2: CircleStyle = {
  fill: '#426046',
  radius: 750,
  offsetX: 0,
  offsetY: 0, // Will be calculated based on radius
};

const defaultCircle3: CircleStyle = {
  fill: '#58825e',
  radius: 500,
  offsetX: 0,
  offsetY: 0, // Will be calculated based on radius
};

const defaultCircle4: CircleStyle = {
  fill: '#73a079',
  radius: 250,
  offsetX: 0,
  offsetY: 0, // Will be calculated based on radius
};

/**
 * Calculate points for a regular polygon
 * @param cx Center X coordinate
 * @param cy Center Y coordinate
 * @param radius Radius (distance from center to vertex)
 * @param sides Number of sides (3 = triangle, 4 = square, etc.)
 * @param rotation Rotation in degrees (0 = point at top)
 * @returns Array of {x, y} points
 */
function calculatePolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
  rotation: number = 0
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const angleStep = (Math.PI * 2) / sides;
  const startAngle = (rotation * Math.PI) / 180 - Math.PI / 2; // Start at top

  for (let i = 0; i < sides; i++) {
    const angle = startAngle + angleStep * i;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return points;
}

/**
 * Convert polygon points to SVG points string
 */
function pointsToString(points: { x: number; y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

/**
 * Render a shape (circle or polygon) based on the circle style
 */
const RenderShape: React.FC<{
  circle: CircleStyle;
  centerX: number;
  centerY: number;
  transform?: string;
}> = ({ circle, centerX, centerY, transform }) => {
  const cx = centerX + (circle.offsetX ?? 0);
  const cy = centerY + (circle.offsetY ?? 0);
  const sides = circle.sides || 0;

  const commonProps = {
    fill: circle.fill,
    stroke: circle.stroke,
    strokeWidth: circle.strokeWidth,
    opacity: circle.opacity,
    transform,
  };

  if (sides >= 3) {
    // Render polygon
    const points = calculatePolygonPoints(
      cx,
      cy,
      circle.radius || 0,
      sides,
      circle.shapeRotation || 0
    );
    return <Polygon points={pointsToString(points)} {...commonProps} />;
  } else {
    // Render circle
    return <Circle cx={cx} cy={cy} r={circle.radius} {...commonProps} />;
  }
};

/**
 * CruxBloom - A highly customizable four-circle icon component
 *
 * This component renders the Crux Garden icon with extensive customization options:
 * - Individual circle colors (solid or gradient)
 * - Border styles for each circle
 * - Position offsets for each circle
 * - Global transformations (skew, rotate, scale)
 * - Gradient support with multiple stops
 *
 * @example
 * ```tsx
 * // Basic usage with defaults
 * <CruxBloom size={100} />
 *
 * // Custom colors
 * <CruxBloom
 *   size={100}
 *   circle1={{ fill: '#ff0000' }}
 *   circle2={{ fill: '#00ff00' }}
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
 *   circle1={{ fill: 'url(#sunset)' }}
 * />
 *
 * // With rotation
 * <CruxBloom
 *   size={100}
 *   rotate={45}
 * />
 * ```
 */
export const CruxBloom: React.FC<CruxBloomProps> = ({
  width = 2000,
  height = 2000,
  size = 100,
  rotate = 0,
  circle1,
  circle2,
  circle3,
  circle4,
  gradients = [],
  style,
  testID = 'crux-bloom',
}) => {
  // Check if we're using triangles
  const hasTriangles =
    (circle1?.sides === 3) ||
    (circle2?.sides === 3) ||
    (circle3?.sides === 3) ||
    (circle4?.sides === 3);

  // Calculate scaled offsets based on the largest radius for proportional scaling
  const r1 = circle1?.radius ?? defaultCircle1.radius!;
  const scaledOffsets = BASE_OFFSET_RATIOS.map(ratio => ratio * r1);

  const defaults = hasTriangles
    ? [
        // For triangles: align all bases at the largest triangle's base, then cascade upward
        { ...defaultCircle1, offsetY: 0 },
        { ...defaultCircle2, offsetY: (r1 - (circle2?.radius ?? defaultCircle2.radius!)) * 0.5 - (scaledOffsets[1] / 2) },
        { ...defaultCircle3, offsetY: (r1 - (circle3?.radius ?? defaultCircle3.radius!)) * 0.5 - (scaledOffsets[2] / 2) },
        { ...defaultCircle4, offsetY: (r1 - (circle4?.radius ?? defaultCircle4.radius!)) * 0.5 - (scaledOffsets[3] / 2) },
      ]
    : [
        // For circles/polygons: use scaled cascade offsets
        { ...defaultCircle1, offsetY: scaledOffsets[0] },
        { ...defaultCircle2, offsetY: scaledOffsets[1] },
        { ...defaultCircle3, offsetY: scaledOffsets[2] },
        { ...defaultCircle4, offsetY: scaledOffsets[3] },
      ];

  // Merge custom styles with defaults
  const c1 = { ...defaults[0], ...circle1 };
  const c2 = { ...defaults[1], ...circle2 };
  const c3 = { ...defaults[2], ...circle3 };
  const c4 = { ...defaults[3], ...circle4 };

  // Calculate center point (in the original coordinate space)
  const centerX = width / 2;
  const centerY = height / 2;

  // Helper function to rotate a point around the center
  const rotatePoint = (x: number, y: number, angle: number) => {
    if (angle === 0) return { x, y };
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = x - centerX;
    const dy = y - centerY;
    return {
      x: centerX + dx * cos - dy * sin,
      y: centerY + dx * sin + dy * cos,
    };
  };

  // Calculate the bounding box needed for all circles (including offsets, radii, strokes, and rotation)
  const circles = [c1, c2, c3, c4];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  circles.forEach((circle) => {
    const cx = centerX + (circle.offsetX || 0);
    const cy = centerY + (circle.offsetY || 0);
    const r = circle.radius || 0;
    const strokePadding = (circle.strokeWidth || 0) / 2;
    const sides = circle.sides || 0;

    let points: { x: number; y: number }[] = [];

    if (sides >= 3) {
      // Polygon - calculate actual vertices
      const polygonPoints = calculatePolygonPoints(cx, cy, r, sides, circle.shapeRotation || 0);
      // Add stroke padding to each vertex
      polygonPoints.forEach((point) => {
        const dx = point.x - cx;
        const dy = point.y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const scale = (distance + strokePadding) / distance;
        points.push({
          x: cx + dx * scale,
          y: cy + dy * scale,
        });
      });
    } else {
      // Circle - use bounding box
      const extent = r + strokePadding;
      points = [
        { x: cx - extent, y: cy - extent }, // top-left
        { x: cx + extent, y: cy - extent }, // top-right
        { x: cx - extent, y: cy + extent }, // bottom-left
        { x: cx + extent, y: cy + extent }, // bottom-right
      ];
    }

    // Apply global rotation to each point and update bounds
    points.forEach((point) => {
      const rotated = rotatePoint(point.x, point.y, rotate);
      minX = Math.min(minX, rotated.x);
      maxX = Math.max(maxX, rotated.x);
      minY = Math.min(minY, rotated.y);
      maxY = Math.max(maxY, rotated.y);
    });
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

  // Calculate actual rendered dimensions proportional to viewBox expansion
  // If content needs more space than the original width/height, expand the rendered size
  const scaleX = viewBoxWidth / width;
  const scaleY = viewBoxHeight / height;
  const renderScale = Math.max(scaleX, scaleY, 1); // At least 1, can be larger
  const actualWidth = size * renderScale;
  const actualHeight = size * renderScale;

  // Build transform string for rotation
  const transform = rotate !== 0 ? `rotate(${rotate} ${centerX} ${centerY})` : undefined;

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

      {/* Shapes (Circles or Polygons) with Transformations */}
      <RenderShape circle={c1} centerX={centerX} centerY={centerY} transform={transform} />
      <RenderShape circle={c2} centerX={centerX} centerY={centerY} transform={transform} />
      <RenderShape circle={c3} centerX={centerX} centerY={centerY} transform={transform} />
      <RenderShape circle={c4} centerX={centerX} centerY={centerY} transform={transform} />
    </Svg>
  );
};

export default CruxBloom;
