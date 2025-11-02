import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { CruxBloom, CruxBloomProps, CircleStyle, GradientDefinition } from './index';

/**
 * Parse hex color to RGB components
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Convert RGB to hex color
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Animation configuration for a single property
 */
export interface AnimationConfig {
  /** Starting value */
  from: number | string;
  /** Ending value */
  to: number | string;
  /** Animation duration in milliseconds (default: 1000) */
  duration?: number;
  /** Loop the animation (default: false) */
  loop?: boolean;
  /** Delay before starting in milliseconds (default: 0) */
  delay?: number;
  /** Easing function (default: linear) */
  easing?: (value: number) => number;
  /** Reverse the animation after completing (default: false) */
  reverse?: boolean;
}

/**
 * Circle animation configuration
 */
export interface CircleAnimationConfig {
  fill?: AnimationConfig;
  opacity?: AnimationConfig;
  radius?: AnimationConfig;
  offsetX?: AnimationConfig;
  offsetY?: AnimationConfig;
  strokeWidth?: AnimationConfig;
  shapeRotation?: AnimationConfig;
}

/**
 * Preset animation types
 */
export type PresetAnimation =
  | 'pulse'
  | 'rotate'
  | 'fade'
  | 'breathe'
  | 'orbit'
  | 'rainbow'
  | 'spin'
  | 'glow';

/**
 * Props for AnimatedBloom component
 */
export interface AnimatedBloomProps extends Omit<CruxBloomProps, 'rotate' | 'circle1' | 'circle2' | 'circle3' | 'circle4'> {
  /** Preset animation to apply */
  preset?: PresetAnimation;
  /** Custom rotation animation */
  animatedRotate?: AnimationConfig;
  /** Custom circle 1 animations */
  animatedCircle1?: CircleAnimationConfig;
  /** Custom circle 2 animations */
  animatedCircle2?: CircleAnimationConfig;
  /** Custom circle 3 animations */
  animatedCircle3?: CircleAnimationConfig;
  /** Custom circle 4 animations */
  animatedCircle4?: CircleAnimationConfig;
  /** Static circle 1 style (base style for animations) */
  circle1?: CircleStyle;
  /** Static circle 2 style (base style for animations) */
  circle2?: CircleStyle;
  /** Static circle 3 style (base style for animations) */
  circle3?: CircleStyle;
  /** Static circle 4 style (base style for animations) */
  circle4?: CircleStyle;
  /** Static rotation value */
  rotate?: number;
  /** Global animation duration for presets (default: 2000) */
  duration?: number;
  /** Whether to loop the animation (default: true for presets) */
  loop?: boolean;
}

/**
 * AnimatedBloom - Animated wrapper for CruxBloom component
 *
 * Supports animating:
 * - Rotation
 * - Circle properties (opacity, radius, offsets, strokeWidth, shapeRotation)
 * - Colors (with smooth interpolation)
 * - Gradients (interpolating color stops)
 *
 * @example
 * ```tsx
 * // Preset animation
 * <AnimatedBloom preset="rainbow" size={150} />
 *
 * // Custom rotation
 * <AnimatedBloom
 *   size={150}
 *   animatedRotate={{ from: 0, to: 360, duration: 3000, loop: true }}
 * />
 *
 * // Custom color animation
 * <AnimatedBloom
 *   size={150}
 *   animatedCircle4={{
 *     fill: { from: '#ff0000', to: '#0000ff', duration: 2000, reverse: true }
 *   }}
 * />
 * ```
 */
export const AnimatedBloom: React.FC<AnimatedBloomProps> = ({
  preset,
  animatedRotate,
  animatedCircle1,
  animatedCircle2,
  animatedCircle3,
  animatedCircle4,
  duration = 2000,
  loop = true,
  rotate: staticRotate,
  circle1: staticCircle1,
  circle2: staticCircle2,
  circle3: staticCircle3,
  circle4: staticCircle4,
  ...bloomProps
}) => {
  // Calculate maximum extent for stable viewBox
  const maxExtent = React.useMemo(() => {
    const centerX = 1000; // Default center
    const centerY = 1000;

    // Helper to get max value from animation config
    const getMaxValue = (base: number, animConfig?: AnimationConfig): number => {
      if (!animConfig) return base;
      const fromVal = typeof animConfig.from === 'number' ? animConfig.from : base;
      const toVal = typeof animConfig.to === 'number' ? animConfig.to : base;
      return Math.max(fromVal, toVal);
    };

    // Define max values for each preset
    let circle1MaxRadius = staticCircle1?.radius || 1000;
    let circle2MaxRadius = staticCircle2?.radius || 750;
    let circle3MaxRadius = staticCircle3?.radius || 500;
    let circle4MaxRadius = staticCircle4?.radius || 250;
    let circle1MaxOffsetX = staticCircle1?.offsetX || 0;
    let circle1MaxOffsetY = staticCircle1?.offsetY || 0;
    let circle2MaxOffsetX = staticCircle2?.offsetX || 0;
    let circle2MaxOffsetY = staticCircle2?.offsetY || 0;
    let circle3MaxOffsetX = staticCircle3?.offsetX || 0;
    let circle3MaxOffsetY = staticCircle3?.offsetY || 0;
    let circle4MaxOffsetX = staticCircle4?.offsetX || 0;
    let circle4MaxOffsetY = staticCircle4?.offsetY || 0;

    // Apply preset maximums
    if (preset === 'pulse') {
      circle4MaxRadius = 300; // pulses from 250 to 300
    } else if (preset === 'breathe') {
      circle1MaxRadius = 1100; // breathes from 1000 to 1100
    } else if (preset === 'orbit') {
      circle4MaxOffsetX = 100; // orbits up to ±100
      circle4MaxOffsetY = 100;
    }

    // Apply custom animation maximums
    if (animatedCircle1) {
      if (animatedCircle1.radius) circle1MaxRadius = getMaxValue(circle1MaxRadius, animatedCircle1.radius);
      if (animatedCircle1.offsetX) circle1MaxOffsetX = getMaxValue(circle1MaxOffsetX, animatedCircle1.offsetX);
      if (animatedCircle1.offsetY) circle1MaxOffsetY = getMaxValue(circle1MaxOffsetY, animatedCircle1.offsetY);
    }
    if (animatedCircle2) {
      if (animatedCircle2.radius) circle2MaxRadius = getMaxValue(circle2MaxRadius, animatedCircle2.radius);
      if (animatedCircle2.offsetX) circle2MaxOffsetX = getMaxValue(circle2MaxOffsetX, animatedCircle2.offsetX);
      if (animatedCircle2.offsetY) circle2MaxOffsetY = getMaxValue(circle2MaxOffsetY, animatedCircle2.offsetY);
    }
    if (animatedCircle3) {
      if (animatedCircle3.radius) circle3MaxRadius = getMaxValue(circle3MaxRadius, animatedCircle3.radius);
      if (animatedCircle3.offsetX) circle3MaxOffsetX = getMaxValue(circle3MaxOffsetX, animatedCircle3.offsetX);
      if (animatedCircle3.offsetY) circle3MaxOffsetY = getMaxValue(circle3MaxOffsetY, animatedCircle3.offsetY);
    }
    if (animatedCircle4) {
      if (animatedCircle4.radius) circle4MaxRadius = getMaxValue(circle4MaxRadius, animatedCircle4.radius);
      if (animatedCircle4.offsetX) circle4MaxOffsetX = getMaxValue(circle4MaxOffsetX, animatedCircle4.offsetX);
      if (animatedCircle4.offsetY) circle4MaxOffsetY = getMaxValue(circle4MaxOffsetY, animatedCircle4.offsetY);
    }

    // Calculate max extent from center for each circle
    const circles = [
      { r: circle1MaxRadius, ox: circle1MaxOffsetX, oy: circle1MaxOffsetY, stroke: staticCircle1?.strokeWidth || 0 },
      { r: circle2MaxRadius, ox: circle2MaxOffsetX, oy: circle2MaxOffsetY, stroke: staticCircle2?.strokeWidth || 0 },
      { r: circle3MaxRadius, ox: circle3MaxOffsetX, oy: circle3MaxOffsetY, stroke: staticCircle3?.strokeWidth || 0 },
      { r: circle4MaxRadius, ox: circle4MaxOffsetX, oy: circle4MaxOffsetY, stroke: staticCircle4?.strokeWidth || 0 },
    ];

    let max = 0;
    circles.forEach(circle => {
      const cx = centerX + circle.ox;
      const cy = centerY + circle.oy;
      const distFromCenter = Math.sqrt(Math.pow(cx - centerX, 2) + Math.pow(cy - centerY, 2));
      const extent = distFromCenter + circle.r + circle.stroke / 2;
      max = Math.max(max, extent);
    });

    return max;
  }, [preset, staticCircle1, staticCircle2, staticCircle3, staticCircle4, animatedCircle1, animatedCircle2, animatedCircle3, animatedCircle4]);

  // State to hold current animated values
  const [animatedValues, setAnimatedValues] = React.useState({
    rotate: staticRotate || 0,
    circle1: {
      fill: staticCircle1?.fill || '#2a3d2c',
      opacity: staticCircle1?.opacity || 1,
      radius: staticCircle1?.radius || 1000,
      offsetX: staticCircle1?.offsetX || 0,
      offsetY: staticCircle1?.offsetY || 0,
      strokeWidth: staticCircle1?.strokeWidth || 0,
      shapeRotation: staticCircle1?.shapeRotation || 0,
    },
    circle2: {
      fill: staticCircle2?.fill || '#426046',
      opacity: staticCircle2?.opacity || 1,
      radius: staticCircle2?.radius || 750,
      offsetX: staticCircle2?.offsetX || 0,
      offsetY: staticCircle2?.offsetY || 0,
      strokeWidth: staticCircle2?.strokeWidth || 0,
      shapeRotation: staticCircle2?.shapeRotation || 0,
    },
    circle3: {
      fill: staticCircle3?.fill || '#58825e',
      opacity: staticCircle3?.opacity || 1,
      radius: staticCircle3?.radius || 500,
      offsetX: staticCircle3?.offsetX || 0,
      offsetY: staticCircle3?.offsetY || 0,
      strokeWidth: staticCircle3?.strokeWidth || 0,
      shapeRotation: staticCircle3?.shapeRotation || 0,
    },
    circle4: {
      fill: staticCircle4?.fill || '#73a079',
      opacity: staticCircle4?.opacity || 1,
      radius: staticCircle4?.radius || 250,
      offsetX: staticCircle4?.offsetX || 0,
      offsetY: staticCircle4?.offsetY || 0,
      strokeWidth: staticCircle4?.strokeWidth || 0,
      shapeRotation: staticCircle4?.shapeRotation || 0,
    },
  });

  // Create animated values
  const rotateAnim = useRef(new Animated.Value(animatedValues.rotate)).current;
  const circle1Anims = useRef({
    opacity: new Animated.Value(animatedValues.circle1.opacity),
    radius: new Animated.Value(animatedValues.circle1.radius),
    offsetX: new Animated.Value(animatedValues.circle1.offsetX),
    offsetY: new Animated.Value(animatedValues.circle1.offsetY),
    strokeWidth: new Animated.Value(animatedValues.circle1.strokeWidth),
    shapeRotation: new Animated.Value(animatedValues.circle1.shapeRotation),
    colorR: new Animated.Value(hexToRgb(animatedValues.circle1.fill as string).r),
    colorG: new Animated.Value(hexToRgb(animatedValues.circle1.fill as string).g),
    colorB: new Animated.Value(hexToRgb(animatedValues.circle1.fill as string).b),
  }).current;
  const circle2Anims = useRef({
    opacity: new Animated.Value(animatedValues.circle2.opacity),
    radius: new Animated.Value(animatedValues.circle2.radius),
    offsetX: new Animated.Value(animatedValues.circle2.offsetX),
    offsetY: new Animated.Value(animatedValues.circle2.offsetY),
    strokeWidth: new Animated.Value(animatedValues.circle2.strokeWidth),
    shapeRotation: new Animated.Value(animatedValues.circle2.shapeRotation),
    colorR: new Animated.Value(hexToRgb(animatedValues.circle2.fill as string).r),
    colorG: new Animated.Value(hexToRgb(animatedValues.circle2.fill as string).g),
    colorB: new Animated.Value(hexToRgb(animatedValues.circle2.fill as string).b),
  }).current;
  const circle3Anims = useRef({
    opacity: new Animated.Value(animatedValues.circle3.opacity),
    radius: new Animated.Value(animatedValues.circle3.radius),
    offsetX: new Animated.Value(animatedValues.circle3.offsetX),
    offsetY: new Animated.Value(animatedValues.circle3.offsetY),
    strokeWidth: new Animated.Value(animatedValues.circle3.strokeWidth),
    shapeRotation: new Animated.Value(animatedValues.circle3.shapeRotation),
    colorR: new Animated.Value(hexToRgb(animatedValues.circle3.fill as string).r),
    colorG: new Animated.Value(hexToRgb(animatedValues.circle3.fill as string).g),
    colorB: new Animated.Value(hexToRgb(animatedValues.circle3.fill as string).b),
  }).current;
  const circle4Anims = useRef({
    opacity: new Animated.Value(animatedValues.circle4.opacity),
    radius: new Animated.Value(animatedValues.circle4.radius),
    offsetX: new Animated.Value(animatedValues.circle4.offsetX),
    offsetY: new Animated.Value(animatedValues.circle4.offsetY),
    strokeWidth: new Animated.Value(animatedValues.circle4.strokeWidth),
    shapeRotation: new Animated.Value(animatedValues.circle4.shapeRotation),
    colorR: new Animated.Value(hexToRgb(animatedValues.circle4.fill as string).r),
    colorG: new Animated.Value(hexToRgb(animatedValues.circle4.fill as string).g),
    colorB: new Animated.Value(hexToRgb(animatedValues.circle4.fill as string).b),
  }).current;

  // Helper to create animation from config
  const createAnimation = (
    animValue: Animated.Value,
    config: AnimationConfig
  ): Animated.CompositeAnimation => {
    const { from, to, duration = 1000, delay = 0, easing = Easing.linear, reverse: shouldReverse } = config;

    // Handle numeric animations
    if (typeof from === 'number' && typeof to === 'number') {
      const anim = Animated.timing(animValue, {
        toValue: to,
        duration,
        delay,
        easing,
        useNativeDriver: false,
      });

      if (shouldReverse) {
        return Animated.sequence([anim, Animated.timing(animValue, {
          toValue: from,
          duration,
          easing,
          useNativeDriver: false,
        })]);
      }

      return anim;
    }

    // Color animations handled separately
    return Animated.timing(animValue, {
      toValue: 1,
      duration,
      delay,
      easing,
      useNativeDriver: false,
    });
  };

  // Helper to create color animation
  const createColorAnimation = (
    rAnim: Animated.Value,
    gAnim: Animated.Value,
    bAnim: Animated.Value,
    config: AnimationConfig
  ): Animated.CompositeAnimation => {
    const { from, to, duration = 1000, delay = 0, easing = Easing.linear, reverse: shouldReverse } = config;

    if (typeof from === 'string' && typeof to === 'string') {
      const fromRgb = hexToRgb(from);
      const toRgb = hexToRgb(to);

      const anims = Animated.parallel([
        Animated.timing(rAnim, {
          toValue: toRgb.r,
          duration,
          delay,
          easing,
          useNativeDriver: false,
        }),
        Animated.timing(gAnim, {
          toValue: toRgb.g,
          duration,
          delay,
          easing,
          useNativeDriver: false,
        }),
        Animated.timing(bAnim, {
          toValue: toRgb.b,
          duration,
          delay,
          easing,
          useNativeDriver: false,
        }),
      ]);

      if (shouldReverse) {
        const reverseAnims = Animated.parallel([
          Animated.timing(rAnim, {
            toValue: fromRgb.r,
            duration,
            easing,
            useNativeDriver: false,
          }),
          Animated.timing(gAnim, {
            toValue: fromRgb.g,
            duration,
            easing,
            useNativeDriver: false,
          }),
          Animated.timing(bAnim, {
            toValue: fromRgb.b,
            duration,
            easing,
            useNativeDriver: false,
          }),
        ]);

        return Animated.sequence([anims, reverseAnims]);
      }

      return anims;
    }

    return Animated.timing(rAnim, { toValue: 0, duration: 0, useNativeDriver: false });
  };

  // Add listeners to update state when animated values change
  useEffect(() => {
    const listenerIds: string[] = [];

    // Add listeners for all animated values
    listenerIds.push(
      rotateAnim.addListener(({ value }) => {
        setAnimatedValues(prev => ({ ...prev, rotate: value }));
      })
    );

    const addCircleListeners = (
      anims: typeof circle1Anims,
      circleKey: 'circle1' | 'circle2' | 'circle3' | 'circle4'
    ) => {
      listenerIds.push(
        anims.opacity.addListener(({ value }) => {
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], opacity: value },
          }));
        })
      );
      listenerIds.push(
        anims.radius.addListener(({ value }) => {
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], radius: value },
          }));
        })
      );
      listenerIds.push(
        anims.offsetX.addListener(({ value }) => {
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], offsetX: value },
          }));
        })
      );
      listenerIds.push(
        anims.offsetY.addListener(({ value }) => {
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], offsetY: value },
          }));
        })
      );
      listenerIds.push(
        anims.strokeWidth.addListener(({ value }) => {
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], strokeWidth: value },
          }));
        })
      );
      listenerIds.push(
        anims.shapeRotation.addListener(({ value }) => {
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], shapeRotation: value },
          }));
        })
      );

      // Color listeners - need to track RGB values
      let currentR = (anims.colorR as any).__getValue();
      let currentG = (anims.colorG as any).__getValue();
      let currentB = (anims.colorB as any).__getValue();

      listenerIds.push(
        anims.colorR.addListener(({ value }) => {
          currentR = value;
          const hexColor = rgbToHex(currentR, currentG, currentB);
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], fill: hexColor },
          }));
        })
      );
      listenerIds.push(
        anims.colorG.addListener(({ value }) => {
          currentG = value;
          const hexColor = rgbToHex(currentR, currentG, currentB);
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], fill: hexColor },
          }));
        })
      );
      listenerIds.push(
        anims.colorB.addListener(({ value }) => {
          currentB = value;
          const hexColor = rgbToHex(currentR, currentG, currentB);
          setAnimatedValues(prev => ({
            ...prev,
            [circleKey]: { ...prev[circleKey], fill: hexColor },
          }));
        })
      );
    };

    addCircleListeners(circle1Anims, 'circle1');
    addCircleListeners(circle2Anims, 'circle2');
    addCircleListeners(circle3Anims, 'circle3');
    addCircleListeners(circle4Anims, 'circle4');

    return () => {
      // Remove all listeners
      rotateAnim.removeAllListeners();
      Object.values(circle1Anims).forEach(anim => anim.removeAllListeners());
      Object.values(circle2Anims).forEach(anim => anim.removeAllListeners());
      Object.values(circle3Anims).forEach(anim => anim.removeAllListeners());
      Object.values(circle4Anims).forEach(anim => anim.removeAllListeners());
    };
  }, []);

  // Apply preset animations
  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];

    if (preset === 'rotate') {
      rotateAnim.setValue(0);
      animations.push(
        Animated.timing(rotateAnim, {
          toValue: 360,
          duration,
          easing: Easing.linear,
          useNativeDriver: false,
        })
      );
    } else if (preset === 'pulse') {
      const pulseAnim = Animated.sequence([
        Animated.timing(circle4Anims.radius, {
          toValue: 300,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(circle4Anims.radius, {
          toValue: 250,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]);
      animations.push(pulseAnim);
    } else if (preset === 'fade') {
      const fadeAnim = Animated.sequence([
        Animated.timing(circle4Anims.opacity, {
          toValue: 0.2,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(circle4Anims.opacity, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]);
      animations.push(fadeAnim);
    } else if (preset === 'breathe') {
      const breatheAnim = Animated.sequence([
        Animated.parallel([
          Animated.timing(circle1Anims.radius, {
            toValue: 1100,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle1Anims.opacity, {
            toValue: 0.6,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(circle1Anims.radius, {
            toValue: 1000,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle1Anims.opacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      ]);
      animations.push(breatheAnim);
    } else if (preset === 'orbit') {
      const orbitAnim = Animated.parallel([
        Animated.sequence([
          Animated.timing(circle4Anims.offsetX, {
            toValue: 100,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.offsetX, {
            toValue: 0,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.offsetX, {
            toValue: -100,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.offsetX, {
            toValue: 0,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
        Animated.sequence([
          Animated.timing(circle4Anims.offsetY, {
            toValue: -100,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.offsetY, {
            toValue: -200,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.offsetY, {
            toValue: -100,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.offsetY, {
            toValue: 0,
            duration: duration / 4,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      ]);
      animations.push(orbitAnim);
    } else if (preset === 'rainbow') {
      // Cycle through rainbow colors
      const rainbowColors = [
        '#ff0000', // Red
        '#ff7f00', // Orange
        '#ffff00', // Yellow
        '#00ff00', // Green
        '#0000ff', // Blue
        '#4b0082', // Indigo
        '#9400d3', // Violet
        '#ff0000', // Back to red
      ];

      const rainbowSequence = rainbowColors.slice(0, -1).map((color, i) => {
        const nextColor = rainbowColors[i + 1];
        return createColorAnimation(
          circle4Anims.colorR,
          circle4Anims.colorG,
          circle4Anims.colorB,
          { from: color, to: nextColor, duration: duration / 7 }
        );
      });

      animations.push(Animated.sequence(rainbowSequence));
    } else if (preset === 'spin') {
      rotateAnim.setValue(0);
      animations.push(
        Animated.parallel([
          Animated.timing(rotateAnim, {
            toValue: 360,
            duration,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.shapeRotation, {
            toValue: -360,
            duration,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
        ])
      );
    } else if (preset === 'glow') {
      const glowAnim = Animated.sequence([
        Animated.parallel([
          Animated.timing(circle1Anims.opacity, {
            toValue: 0.3,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle2Anims.opacity, {
            toValue: 0.5,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle3Anims.opacity, {
            toValue: 0.7,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.opacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
        Animated.parallel([
          Animated.timing(circle1Anims.opacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle2Anims.opacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle3Anims.opacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(circle4Anims.opacity, {
            toValue: 1,
            duration: duration / 2,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }),
        ]),
      ]);
      animations.push(glowAnim);
    }

    // Apply custom animations
    if (animatedRotate) {
      rotateAnim.setValue(animatedRotate.from as number);
      animations.push(createAnimation(rotateAnim, animatedRotate));
    }

    if (animatedCircle1) {
      Object.entries(animatedCircle1).forEach(([key, config]) => {
        if (config) {
          if (key === 'fill') {
            animations.push(createColorAnimation(circle1Anims.colorR, circle1Anims.colorG, circle1Anims.colorB, config));
          } else {
            animations.push(createAnimation(circle1Anims[key as keyof typeof circle1Anims], config));
          }
        }
      });
    }

    if (animatedCircle2) {
      Object.entries(animatedCircle2).forEach(([key, config]) => {
        if (config) {
          if (key === 'fill') {
            animations.push(createColorAnimation(circle2Anims.colorR, circle2Anims.colorG, circle2Anims.colorB, config));
          } else {
            animations.push(createAnimation(circle2Anims[key as keyof typeof circle2Anims], config));
          }
        }
      });
    }

    if (animatedCircle3) {
      Object.entries(animatedCircle3).forEach(([key, config]) => {
        if (config) {
          if (key === 'fill') {
            animations.push(createColorAnimation(circle3Anims.colorR, circle3Anims.colorG, circle3Anims.colorB, config));
          } else {
            animations.push(createAnimation(circle3Anims[key as keyof typeof circle3Anims], config));
          }
        }
      });
    }

    if (animatedCircle4) {
      Object.entries(animatedCircle4).forEach(([key, config]) => {
        if (config) {
          if (key === 'fill') {
            animations.push(createColorAnimation(circle4Anims.colorR, circle4Anims.colorG, circle4Anims.colorB, config));
          } else {
            animations.push(createAnimation(circle4Anims[key as keyof typeof circle4Anims], config));
          }
        }
      });
    }

    // Start animations
    if (animations.length > 0) {
      const compositeAnim = Animated.parallel(animations);
      if (loop) {
        Animated.loop(compositeAnim).start();
      } else {
        compositeAnim.start();
      }
    }

    return () => {
      // Cleanup
      rotateAnim.stopAnimation();
      Object.values(circle1Anims).forEach(anim => anim.stopAnimation());
      Object.values(circle2Anims).forEach(anim => anim.stopAnimation());
      Object.values(circle3Anims).forEach(anim => anim.stopAnimation());
      Object.values(circle4Anims).forEach(anim => anim.stopAnimation());
    };
  }, [preset, duration, loop, animatedRotate, animatedCircle1, animatedCircle2, animatedCircle3, animatedCircle4]);

  // Build circle styles from animated state
  const animatedCircle1Style: CircleStyle = {
    ...staticCircle1,
    ...animatedValues.circle1,
  };

  const animatedCircle2Style: CircleStyle = {
    ...staticCircle2,
    ...animatedValues.circle2,
  };

  const animatedCircle3Style: CircleStyle = {
    ...staticCircle3,
    ...animatedValues.circle3,
  };

  const animatedCircle4Style: CircleStyle = {
    ...staticCircle4,
    ...animatedValues.circle4,
  };

  return (
    <CruxBloom
      {...bloomProps}
      rotate={animatedValues.rotate}
      circle1={animatedCircle1Style}
      circle2={animatedCircle2Style}
      circle3={animatedCircle3Style}
      circle4={animatedCircle4Style}
      stableViewBox={true}
      maxExtentOverride={maxExtent}
    />
  );
};

export default AnimatedBloom;
