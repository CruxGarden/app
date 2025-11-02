/**
 * Theme presets and types for CruxBloom component customization
 *
 * These types help theme designers create consistent, reusable bloom configurations
 */

import type { CruxBloomProps, CircleStyle, GradientDefinition } from './index';

/**
 * Complete theme configuration for CruxBloom
 */
export interface CruxBloomTheme {
  /** Theme name/identifier */
  name: string;
  /** Optional description */
  description?: string;
  /** Complete bloom configuration */
  config: Omit<CruxBloomProps, 'size' | 'style' | 'testID'>;
}

/**
 * Preset gradients for common use cases
 */
export const PRESET_GRADIENTS = {
  sunset: {
    id: 'sunset',
    stops: [
      { color: '#ff6b6b', offset: '0%' },
      { color: '#feca57', offset: '100%' },
    ],
    angle: 135,
  } as GradientDefinition,

  ocean: {
    id: 'ocean',
    stops: [
      { color: '#00d2ff', offset: '0%' },
      { color: '#3a7bd5', offset: '100%' },
    ],
    angle: 180,
  } as GradientDefinition,

  forest: {
    id: 'forest',
    stops: [
      { color: '#134e5e', offset: '0%' },
      { color: '#71b280', offset: '100%' },
    ],
    angle: 90,
  } as GradientDefinition,

  twilight: {
    id: 'twilight',
    stops: [
      { color: '#2c3e50', offset: '0%' },
      { color: '#3498db', offset: '50%' },
      { color: '#2980b9', offset: '100%' },
    ],
    angle: 45,
  } as GradientDefinition,

  fire: {
    id: 'fire',
    stops: [
      { color: '#f12711', offset: '0%' },
      { color: '#f5af19', offset: '100%' },
    ],
    angle: 90,
  } as GradientDefinition,

  midnight: {
    id: 'midnight',
    stops: [
      { color: '#232526', offset: '0%' },
      { color: '#414345', offset: '100%' },
    ],
    angle: 180,
  } as GradientDefinition,

  aurora: {
    id: 'aurora',
    stops: [
      { color: '#00c9ff', offset: '0%' },
      { color: '#92fe9d', offset: '100%' },
    ],
    angle: 135,
  } as GradientDefinition,

  lavender: {
    id: 'lavender',
    stops: [
      { color: '#834d9b', offset: '0%' },
      { color: '#d04ed6', offset: '100%' },
    ],
    angle: 90,
  } as GradientDefinition,
} as const;

/**
 * Preset theme configurations
 */
export const PRESET_THEMES: Record<string, CruxBloomTheme> = {
  default: {
    name: 'Default',
    description: 'Original Crux Garden colors',
    config: {
      circle1: { fill: '#2a3d2c' },
      circle2: { fill: '#426046' },
      circle3: { fill: '#58825e' },
      circle4: { fill: '#73a079' },
    },
  },

  oceanBreeze: {
    name: 'Ocean Breeze',
    description: 'Cool ocean-inspired gradients',
    config: {
      gradients: [PRESET_GRADIENTS.ocean],
      circle1: { fill: 'url(#ocean)', opacity: 0.3 },
      circle2: { fill: 'url(#ocean)', opacity: 0.5 },
      circle3: { fill: 'url(#ocean)', opacity: 0.7 },
      circle4: { fill: 'url(#ocean)', opacity: 1 },
    },
  },

  sunsetGlow: {
    name: 'Sunset Glow',
    description: 'Warm sunset colors with bloom effect',
    config: {
      gradients: [PRESET_GRADIENTS.sunset],
      circle1: { fill: '#ff6b6b', opacity: 0.2 },
      circle2: { fill: '#ff8787', opacity: 0.4 },
      circle3: { fill: '#ffa07a', opacity: 0.6 },
      circle4: { fill: 'url(#sunset)', opacity: 1 },
    },
  },

  forestShadow: {
    name: 'Forest Shadow',
    description: 'Deep forest greens with subtle borders',
    config: {
      circle1: { fill: '#1a3a1a', stroke: '#2d5a2d', strokeWidth: 8 },
      circle2: { fill: '#2d5a2d', stroke: '#3d7a3d', strokeWidth: 6 },
      circle3: { fill: '#3d7a3d', stroke: '#4d9a4d', strokeWidth: 4 },
      circle4: { fill: '#4d9a4d', stroke: '#ffffff', strokeWidth: 2 },
    },
  },

  twilightDream: {
    name: 'Twilight Dream',
    description: 'Ethereal twilight colors',
    config: {
      gradients: [PRESET_GRADIENTS.twilight],
      circle1: { fill: 'url(#twilight)', opacity: 0.4 },
      circle2: { fill: 'url(#twilight)', opacity: 0.6 },
      circle3: { fill: 'url(#twilight)', opacity: 0.8 },
      circle4: { fill: 'url(#twilight)', opacity: 1 },
    },
  },

  fireBurst: {
    name: 'Fire Burst',
    description: 'Explosive fire colors with offset',
    config: {
      gradients: [PRESET_GRADIENTS.fire],
      circle1: { fill: '#1a0000', offsetY: 0 },
      circle2: { fill: '#4d0000', offsetY: 100 },
      circle3: { fill: '#800000', offsetY: 200 },
      circle4: { fill: 'url(#fire)', offsetY: 350 },
    },
  },

  midnightRing: {
    name: 'Midnight Ring',
    description: 'Dark theme with glowing borders',
    config: {
      gradients: [PRESET_GRADIENTS.midnight],
      circle1: { fill: 'url(#midnight)', stroke: '#ffffff', strokeWidth: 2, opacity: 0.8 },
      circle2: { fill: 'url(#midnight)', stroke: '#cccccc', strokeWidth: 4, opacity: 0.9 },
      circle3: { fill: 'url(#midnight)', stroke: '#aaaaaa', strokeWidth: 6, opacity: 0.95 },
      circle4: { fill: '#ffffff', opacity: 1 },
    },
  },

  auroraShift: {
    name: 'Aurora Shift',
    description: 'Shifted circles with aurora gradient',
    config: {
      gradients: [PRESET_GRADIENTS.aurora],
      circle1: { fill: 'url(#aurora)', offsetX: -50, offsetY: -50 },
      circle2: { fill: 'url(#aurora)', offsetX: 0, offsetY: 100 },
      circle3: { fill: 'url(#aurora)', offsetX: 50, offsetY: 250 },
      circle4: { fill: 'url(#aurora)', offsetX: 0, offsetY: 400 },
    },
  },

  lavenderRotate: {
    name: 'Lavender Rotate',
    description: 'Rotated lavender gradient',
    config: {
      gradients: [PRESET_GRADIENTS.lavender],
      rotate: 10,
      circle1: { fill: 'url(#lavender)', opacity: 0.3 },
      circle2: { fill: 'url(#lavender)', opacity: 0.5 },
      circle3: { fill: 'url(#lavender)', opacity: 0.7 },
      circle4: { fill: 'url(#lavender)', opacity: 1 },
    },
  },

  geometricShift: {
    name: 'Geometric Shift',
    description: 'Asymmetric layout with varied radii',
    config: {
      circle1: { fill: '#e74c3c', radius: 900, offsetX: -100 },
      circle2: { fill: '#3498db', radius: 600, offsetX: 100, offsetY: 200 },
      circle3: { fill: '#2ecc71', radius: 400, offsetX: -50, offsetY: 350 },
      circle4: { fill: '#f39c12', radius: 200, offsetX: 50, offsetY: 500 },
    },
  },
};

/**
 * Helper function to create a custom theme
 */
export function createCruxBloomTheme(
  name: string,
  config: Omit<CruxBloomProps, 'size' | 'style' | 'testID'>,
  description?: string
): CruxBloomTheme {
  return {
    name,
    description,
    config,
  };
}

/**
 * Helper function to blend two circle styles
 */
export function blendCircleStyles(
  base: CircleStyle,
  override: Partial<CircleStyle>
): CircleStyle {
  return { ...base, ...override };
}

/**
 * Helper to create a monochromatic theme from a base color
 */
export function createMonochromaticTheme(
  name: string,
  baseColor: string,
  options?: {
    lighten?: boolean;
    withBorders?: boolean;
    rotate?: number;
  }
): CruxBloomTheme {
  const { lighten = true, withBorders = false, rotate } = options || {};

  // Simple color lightening (this is basic - you might want a proper color library)
  const adjustOpacity = (index: number) => {
    return lighten ? 0.3 + index * 0.2 : 1 - index * 0.15;
  };

  const config: Omit<CruxBloomProps, 'size' | 'style' | 'testID'> = {
    circle1: {
      fill: baseColor,
      opacity: adjustOpacity(0),
      ...(withBorders && { stroke: baseColor, strokeWidth: 8 }),
    },
    circle2: {
      fill: baseColor,
      opacity: adjustOpacity(1),
      ...(withBorders && { stroke: baseColor, strokeWidth: 6 }),
    },
    circle3: {
      fill: baseColor,
      opacity: adjustOpacity(2),
      ...(withBorders && { stroke: baseColor, strokeWidth: 4 }),
    },
    circle4: {
      fill: baseColor,
      opacity: adjustOpacity(3),
      ...(withBorders && { stroke: baseColor, strokeWidth: 2 }),
    },
  };

  if (rotate !== undefined) {
    config.rotate = rotate;
  }

  return {
    name,
    description: `Monochromatic theme based on ${baseColor}`,
    config,
  };
}
