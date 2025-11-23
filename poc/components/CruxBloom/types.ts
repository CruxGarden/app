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
      primary: { fill: '#2a3d2c' },
      secondary: { fill: '#426046' },
      tertiary: { fill: '#58825e' },
      quaternary: { fill: '#73a079' },
    },
  },

  oceanBreeze: {
    name: 'Ocean Breeze',
    description: 'Cool ocean-inspired gradients',
    config: {
      gradients: [PRESET_GRADIENTS.ocean],
      primary: { fill: 'url(#ocean)', opacity: 0.3 },
      secondary: { fill: 'url(#ocean)', opacity: 0.5 },
      tertiary: { fill: 'url(#ocean)', opacity: 0.7 },
      quaternary: { fill: 'url(#ocean)', opacity: 1 },
    },
  },

  sunsetGlow: {
    name: 'Sunset Glow',
    description: 'Warm sunset colors with bloom effect',
    config: {
      gradients: [PRESET_GRADIENTS.sunset],
      primary: { fill: '#ff6b6b', opacity: 0.2 },
      secondary: { fill: '#ff8787', opacity: 0.4 },
      tertiary: { fill: '#ffa07a', opacity: 0.6 },
      quaternary: { fill: 'url(#sunset)', opacity: 1 },
    },
  },

  forestShadow: {
    name: 'Forest Shadow',
    description: 'Deep forest greens with subtle borders',
    config: {
      primary: { fill: '#1a3a1a', stroke: '#2d5a2d', strokeWidth: 8 },
      secondary: { fill: '#2d5a2d', stroke: '#3d7a3d', strokeWidth: 6 },
      tertiary: { fill: '#3d7a3d', stroke: '#4d9a4d', strokeWidth: 4 },
      quaternary: { fill: '#4d9a4d', stroke: '#ffffff', strokeWidth: 2 },
    },
  },

  twilightDream: {
    name: 'Twilight Dream',
    description: 'Ethereal twilight colors',
    config: {
      gradients: [PRESET_GRADIENTS.twilight],
      primary: { fill: 'url(#twilight)', opacity: 0.4 },
      secondary: { fill: 'url(#twilight)', opacity: 0.6 },
      tertiary: { fill: 'url(#twilight)', opacity: 0.8 },
      quaternary: { fill: 'url(#twilight)', opacity: 1 },
    },
  },

  fireBurst: {
    name: 'Fire Burst',
    description: 'Explosive fire colors',
    config: {
      gradients: [PRESET_GRADIENTS.fire],
      primary: { fill: '#1a0000', opacity: 0.5 },
      secondary: { fill: '#4d0000', opacity: 0.7 },
      tertiary: { fill: '#800000', opacity: 0.9 },
      quaternary: { fill: 'url(#fire)', opacity: 1 },
    },
  },

  midnightRing: {
    name: 'Midnight Ring',
    description: 'Dark theme with glowing borders',
    config: {
      gradients: [PRESET_GRADIENTS.midnight],
      primary: { fill: 'url(#midnight)', stroke: '#ffffff', strokeWidth: 2, opacity: 0.8 },
      secondary: { fill: 'url(#midnight)', stroke: '#cccccc', strokeWidth: 4, opacity: 0.9 },
      tertiary: { fill: 'url(#midnight)', stroke: '#aaaaaa', strokeWidth: 6, opacity: 0.95 },
      quaternary: { fill: '#ffffff', opacity: 1 },
    },
  },

  auroraShift: {
    name: 'Aurora Shift',
    description: 'Aurora gradient with varying opacity',
    config: {
      gradients: [PRESET_GRADIENTS.aurora],
      primary: { fill: 'url(#aurora)', opacity: 0.4 },
      secondary: { fill: 'url(#aurora)', opacity: 0.6 },
      tertiary: { fill: 'url(#aurora)', opacity: 0.8 },
      quaternary: { fill: 'url(#aurora)', opacity: 1 },
    },
  },

  lavenderDream: {
    name: 'Lavender Dream',
    description: 'Soft lavender gradient',
    config: {
      gradients: [PRESET_GRADIENTS.lavender],
      primary: { fill: 'url(#lavender)', opacity: 0.3 },
      secondary: { fill: 'url(#lavender)', opacity: 0.5 },
      tertiary: { fill: 'url(#lavender)', opacity: 0.7 },
      quaternary: { fill: 'url(#lavender)', opacity: 1 },
    },
  },

  vibrantRainbow: {
    name: 'Vibrant Rainbow',
    description: 'Bold rainbow colors',
    config: {
      primary: { fill: '#e74c3c' },
      secondary: { fill: '#f39c12' },
      tertiary: { fill: '#2ecc71' },
      quaternary: { fill: '#3498db' },
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
export function blendCircleStyles(base: CircleStyle, override: Partial<CircleStyle>): CircleStyle {
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
  }
): CruxBloomTheme {
  const { lighten = true, withBorders = false } = options || {};

  // Simple color lightening using opacity
  const adjustOpacity = (index: number) => {
    return lighten ? 0.3 + index * 0.2 : 1 - index * 0.15;
  };

  const config: Omit<CruxBloomProps, 'size' | 'style' | 'testID'> = {
    primary: {
      fill: baseColor,
      opacity: adjustOpacity(0),
      ...(withBorders && { stroke: baseColor, strokeWidth: 8 }),
    },
    secondary: {
      fill: baseColor,
      opacity: adjustOpacity(1),
      ...(withBorders && { stroke: baseColor, strokeWidth: 6 }),
    },
    tertiary: {
      fill: baseColor,
      opacity: adjustOpacity(2),
      ...(withBorders && { stroke: baseColor, strokeWidth: 4 }),
    },
    quaternary: {
      fill: baseColor,
      opacity: adjustOpacity(3),
      ...(withBorders && { stroke: baseColor, strokeWidth: 2 }),
    },
  };

  return {
    name,
    description: `Monochromatic theme based on ${baseColor}`,
    config,
  };
}
