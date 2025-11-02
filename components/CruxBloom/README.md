# CruxBloom Component

A highly customizable React component for rendering the Crux Garden icon with dynamic styling, colors, gradients, and transformations.

## Features

- 🎨 **Individual circle customization** - Control colors, opacity, borders for each of the 4 circles
- 🌈 **Gradient support** - Linear gradients with multiple stops and configurable angles
- 📐 **Rotation** - Rotate the entire bloom
- 📍 **Positioning** - Offset each circle independently for creative layouts
- 🎭 **Theme presets** - 10+ pre-configured themes ready to use
- 🔧 **Type-safe** - Full TypeScript support with comprehensive types

## Installation

The component is already part of the app. Import it from:

```tsx
import { CruxBloom } from '@/components/CruxBloom';
// or
import CruxBloom from '@/components/CruxBloom';
```

## Basic Usage

```tsx
import { CruxBloom } from '@/components/CruxBloom';

// Default bloom with custom size
<CruxBloom size={100} />
```

## Customization Examples

### Custom Colors

```tsx
<CruxBloom
  size={150}
  circle1={{ fill: '#ff0000' }}
  circle2={{ fill: '#00ff00' }}
  circle3={{ fill: '#0000ff' }}
  circle4={{ fill: '#ffff00' }}
/>
```

### With Borders

```tsx
<CruxBloom
  size={150}
  circle1={{ fill: '#2a3d2c', stroke: '#ffffff', strokeWidth: 10 }}
  circle2={{ fill: '#426046', stroke: '#cccccc', strokeWidth: 8 }}
  circle3={{ fill: '#58825e', stroke: '#aaaaaa', strokeWidth: 6 }}
  circle4={{ fill: '#73a079', stroke: '#888888', strokeWidth: 4 }}
/>
```

### With Gradients

```tsx
<CruxBloom
  size={150}
  gradients={[
    {
      id: 'sunset',
      stops: [
        { color: '#ff6b6b', offset: '0%' },
        { color: '#feca57', offset: '100%' }
      ],
      angle: 135
    }
  ]}
  circle1={{ fill: 'url(#sunset)', opacity: 0.4 }}
  circle2={{ fill: 'url(#sunset)', opacity: 0.6 }}
  circle3={{ fill: 'url(#sunset)', opacity: 0.8 }}
  circle4={{ fill: 'url(#sunset)', opacity: 1 }}
/>
```

### With Rotation

```tsx
// Rotated
<CruxBloom
  size={150}
  rotate={45}
/>
```

### Offset Circles

```tsx
<CruxBloom
  size={150}
  circle1={{ fill: '#e74c3c', offsetX: -50, offsetY: -50 }}
  circle2={{ fill: '#3498db', offsetX: 0, offsetY: 100 }}
  circle3={{ fill: '#2ecc71', offsetX: 50, offsetY: 250 }}
  circle4={{ fill: '#f39c12', offsetX: 0, offsetY: 400 }}
/>
```

### Custom Radii

```tsx
<CruxBloom
  size={150}
  circle1={{ fill: '#2a3d2c', radius: 900 }}
  circle2={{ fill: '#426046', radius: 600 }}
  circle3={{ fill: '#58825e', radius: 300 }}
  circle4={{ fill: '#73a079', radius: 150 }}
/>
```

## Using Preset Themes

```tsx
import { CruxBloom } from '@/components/CruxBloom';
import { PRESET_THEMES } from '@/components/CruxBloom/types';

// Apply a preset theme
<CruxBloom
  size={150}
  {...PRESET_THEMES.oceanBreeze.config}
/>

// Combine preset with custom overrides
<CruxBloom
  size={150}
  {...PRESET_THEMES.sunsetGlow.config}
  rotate={45}
  circle4={{ fill: '#ffffff' }}
/>
```

### Available Preset Themes

- `default` - Original Crux Garden colors
- `oceanBreeze` - Cool ocean-inspired gradients
- `sunsetGlow` - Warm sunset colors with bloom effect
- `forestShadow` - Deep forest greens with subtle borders
- `twilightDream` - Ethereal twilight colors with skew
- `fireBurst` - Explosive fire colors with offset
- `midnightRing` - Dark theme with glowing borders
- `auroraShift` - Shifted circles with aurora gradient
- `lavenderSkew` - Skewed perspective with lavender gradient
- `geometricShift` - Asymmetric layout with varied radii

## Creating Custom Themes

```tsx
import { createCruxBloomTheme, createMonochromaticTheme } from '@/components/CruxBloom/types';

// Create a custom theme
const myTheme = createCruxBloomTheme(
  'My Custom Theme',
  {
    circle1: { fill: '#ff0000', opacity: 0.5 },
    circle2: { fill: '#00ff00', opacity: 0.6 },
    circle3: { fill: '#0000ff', opacity: 0.7 },
    circle4: { fill: '#ffff00', opacity: 1 },
    skewX: 10,
  },
  'A vibrant custom theme'
);

// Use it
<CruxBloom size={150} {...myTheme.config} />

// Create a monochromatic theme
const blueTheme = createMonochromaticTheme('Blue Theme', '#3498db', {
  lighten: true,
  withBorders: true,
  rotate: 15
});

<CruxBloom size={150} {...blueTheme.config} />
```

## Advanced: Multiple Gradients

```tsx
<CruxBloom
  size={150}
  gradients={[
    {
      id: 'gradient1',
      stops: [
        { color: '#ff6b6b', offset: '0%' },
        { color: '#feca57', offset: '100%' }
      ],
      angle: 90
    },
    {
      id: 'gradient2',
      stops: [
        { color: '#00d2ff', offset: '0%' },
        { color: '#3a7bd5', offset: '100%' }
      ],
      angle: 180
    },
    {
      id: 'gradient3',
      stops: [
        { color: '#134e5e', offset: '0%' },
        { color: '#71b280', offset: '100%' }
      ],
      angle: 45
    }
  ]}
  circle1={{ fill: 'url(#gradient1)' }}
  circle2={{ fill: 'url(#gradient2)' }}
  circle3={{ fill: 'url(#gradient3)' }}
  circle4={{ fill: '#ffffff' }}
/>
```

## API Reference

### CruxBloomProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `size` | `number` | `100` | Size in pixels (width/height) |
| `width` | `number` | `2000` | ViewBox width |
| `height` | `number` | `2000` | ViewBox height |
| `rotate` | `number` | `0` | Rotation in degrees |
| `circle1` | `CircleStyle` | See defaults | Outermost circle (r=1000) |
| `circle2` | `CircleStyle` | See defaults | Second circle (r=750) |
| `circle3` | `CircleStyle` | See defaults | Third circle (r=500) |
| `circle4` | `CircleStyle` | See defaults | Innermost circle (r=250) |
| `gradients` | `GradientDefinition[]` | `[]` | Array of gradient definitions |
| `style` | `any` | - | Additional SVG styles |
| `testID` | `string` | `'crux-bloom'` | Test identifier |

### CircleStyle

| Property | Type | Description |
|----------|------|-------------|
| `fill` | `string` | Fill color or gradient reference (`url(#id)`) |
| `stroke` | `string` | Border color |
| `strokeWidth` | `number` | Border width |
| `opacity` | `number` | Opacity (0-1) |
| `offsetX` | `number` | Horizontal offset from center |
| `offsetY` | `number` | Vertical offset from center |
| `radius` | `number` | Circle radius |

### GradientDefinition

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique gradient ID |
| `stops` | `Array<{color, offset, opacity?}>` | Gradient color stops |
| `angle` | `number` | Gradient angle in degrees (0=→, 90=↓) |
| `type` | `'linear' \| 'radial'` | Gradient type (linear only for now) |

## Default Circle Positions

The original SVG has these default values:

- **Circle 1**: Center (1000, 1000), radius 1000, color #2a3d2c
- **Circle 2**: Offset (1000, 1137), radius 750, color #426046
- **Circle 3**: Offset (1000, 1276), radius 500, color #58825e
- **Circle 4**: Offset (1000, 1421), radius 250, color #73a079

The component maintains these as defaults, with offsets calculated relative to the center.

## Platform Support

This component works on:
- ✅ iOS
- ✅ Android
- ✅ Web

It uses `react-native-svg` which is cross-platform compatible.

## Performance Tips

1. **Reuse gradient definitions** - Define gradients once and reference them multiple times
2. **Minimize transforms** - Avoid unnecessary transformations for better performance
3. **Use opacity carefully** - Too many overlapping semi-transparent circles can impact rendering
4. **Static themes** - For static blooms, consider memoizing the component

## Examples in Action

See the preset themes in `types.ts` for real-world examples of creative bloom configurations.

---

# AnimatedBloom Component

An animated wrapper for CruxBloom that supports smooth transitions and animations with color interpolation.

## Features

- 🎬 **8 Preset Animations** - Ready-to-use animation patterns
- 🌈 **Color Interpolation** - Smooth color transitions between any colors
- 🎯 **Multi-property Animations** - Animate multiple properties simultaneously
- 🔄 **Looping Support** - Continuous animations
- ⏱️ **Customizable Timing** - Control duration, easing, delays
- 🔁 **Reversible** - Animations can reverse after completing

## Installation

The component is already part of the app. Import it from:

```tsx
import { AnimatedBloom } from '@/components/CruxBloom/AnimatedBloom';
```

## Basic Usage

### Preset Animations

```tsx
import { AnimatedBloom } from '@/components/CruxBloom/AnimatedBloom';

// Continuous rotation
<AnimatedBloom preset="rotate" size={150} duration={3000} />

// Pulsing effect
<AnimatedBloom preset="pulse" size={150} duration={1500} />

// Rainbow color cycle
<AnimatedBloom preset="rainbow" size={150} duration={7000} />
```

### Custom Animations

```tsx
// Rotate with custom timing
<AnimatedBloom
  size={150}
  animatedRotate={{ from: 0, to: 360, duration: 4000 }}
  loop
/>

// Color fade on inner circle
<AnimatedBloom
  size={150}
  animatedCircle4={{
    fill: { from: '#ff0000', to: '#0000ff', duration: 3000, reverse: true }
  }}
  loop
/>

// Multi-property animation
<AnimatedBloom
  size={150}
  animatedCircle4={{
    radius: { from: 250, to: 350, duration: 2000, reverse: true },
    opacity: { from: 1, to: 0.3, duration: 2000, reverse: true },
    fill: { from: '#2ecc71', to: '#e74c3c', duration: 2000, reverse: true }
  }}
  loop
/>
```

## Preset Animations

### `rotate`
Continuous rotation of the entire bloom.

```tsx
<AnimatedBloom preset="rotate" size={150} duration={3000} />
```

### `pulse`
Inner circle pulsing (radius changes).

```tsx
<AnimatedBloom preset="pulse" size={150} duration={1500} />
```

### `fade`
Inner circle fading in and out (opacity changes).

```tsx
<AnimatedBloom preset="fade" size={150} duration={2000} />
```

### `breathe`
Outer circle breathing (radius + opacity together).

```tsx
<AnimatedBloom preset="breathe" size={150} duration={2500} />
```

### `orbit`
Inner circle orbiting around center (offsetX/Y changes).

```tsx
<AnimatedBloom preset="orbit" size={150} duration={4000} />
```

### `rainbow`
Inner circle cycling through rainbow colors.

```tsx
<AnimatedBloom preset="rainbow" size={150} duration={7000} />
```

### `spin`
Global rotation with counter-rotating shapes (great with triangles).

```tsx
<AnimatedBloom
  preset="spin"
  size={150}
  duration={4000}
  circle1={{ sides: 3 }}
  circle2={{ sides: 3 }}
  circle3={{ sides: 3 }}
  circle4={{ sides: 3 }}
/>
```

### `glow`
Cascading opacity glow effect across all circles.

```tsx
<AnimatedBloom preset="glow" size={150} duration={2500} />
```

## Custom Animations

### AnimationConfig

Each animatable property accepts an `AnimationConfig` object:

```typescript
{
  from: number | string;      // Starting value
  to: number | string;        // Ending value
  duration?: number;          // Duration in ms (default: 1000)
  loop?: boolean;             // Loop the animation (default: false)
  delay?: number;             // Delay before starting in ms (default: 0)
  easing?: (value) => number; // Easing function (default: linear)
  reverse?: boolean;          // Reverse after completing (default: false)
}
```

### Animatable Properties

#### Global

- `animatedRotate` - Rotate the entire bloom

#### Per Circle (circle1, circle2, circle3, circle4)

- `fill` - Color (supports hex colors like `'#ff0000'`)
- `opacity` - Opacity (0-1)
- `radius` - Circle/polygon radius
- `offsetX` - Horizontal offset
- `offsetY` - Vertical offset
- `strokeWidth` - Border width
- `shapeRotation` - Individual shape rotation

### Example: Complex Animation

```tsx
<AnimatedBloom
  size={150}
  duration={6000}
  circle1={{ sides: 3 }}
  circle2={{ sides: 3 }}
  circle3={{ sides: 3 }}
  circle4={{ sides: 3 }}
  animatedRotate={{ from: 0, to: 360 }}
  animatedCircle1={{
    fill: { from: '#e74c3c', to: '#3498db' },
    opacity: { from: 0.4, to: 0.8, reverse: true }
  }}
  animatedCircle2={{
    fill: { from: '#e67e22', to: '#2ecc71' },
    shapeRotation: { from: 0, to: 120 }
  }}
  animatedCircle3={{
    fill: { from: '#f39c12', to: '#9b59b6' },
    radius: { from: 500, to: 600, reverse: true }
  }}
  animatedCircle4={{
    fill: { from: '#f1c40f', to: '#e74c3c' },
    offsetY: { from: 0, to: -100, reverse: true }
  }}
  loop
/>
```

## API Reference

### AnimatedBloomProps

Extends all `CruxBloomProps` plus:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `preset` | `PresetAnimation` | - | Preset animation to apply |
| `animatedRotate` | `AnimationConfig` | - | Custom rotation animation |
| `animatedCircle1` | `CircleAnimationConfig` | - | Custom circle 1 animations |
| `animatedCircle2` | `CircleAnimationConfig` | - | Custom circle 2 animations |
| `animatedCircle3` | `CircleAnimationConfig` | - | Custom circle 3 animations |
| `animatedCircle4` | `CircleAnimationConfig` | - | Custom circle 4 animations |
| `duration` | `number` | `2000` | Global animation duration for presets |
| `loop` | `boolean` | `true` | Whether to loop the animation |

### CircleAnimationConfig

```typescript
{
  fill?: AnimationConfig;         // Color animation
  opacity?: AnimationConfig;      // Opacity animation
  radius?: AnimationConfig;       // Radius animation
  offsetX?: AnimationConfig;      // Horizontal offset animation
  offsetY?: AnimationConfig;      // Vertical offset animation
  strokeWidth?: AnimationConfig;  // Border width animation
  shapeRotation?: AnimationConfig;// Individual shape rotation
}
```

### PresetAnimation Types

```typescript
type PresetAnimation =
  | 'pulse'
  | 'rotate'
  | 'fade'
  | 'breathe'
  | 'orbit'
  | 'rainbow'
  | 'spin'
  | 'glow';
```

## Color Interpolation

The component automatically interpolates between hex colors smoothly:

```tsx
// Smoothly transition from red to blue
<AnimatedBloom
  size={150}
  animatedCircle4={{
    fill: { from: '#ff0000', to: '#0000ff', duration: 2000 }
  }}
/>

// Rainbow cycle (multi-stop color animation)
<AnimatedBloom preset="rainbow" size={150} duration={7000} />
```

The color interpolation:
- Parses hex colors to RGB components
- Animates each RGB channel separately
- Converts back to hex for rendering
- Supports smooth transitions between any colors

## Performance Tips

1. **Limit simultaneous animations** - Too many animated blooms can impact performance
2. **Use appropriate durations** - Longer animations are smoother but use more resources
3. **Prefer preset animations** - They're optimized for common use cases
4. **Avoid animating too many properties at once** - Focus on 2-3 key properties
5. **Use native driver when possible** - (Note: Currently set to `false` due to SVG requirements)

## Platform Support

AnimatedBloom works on:
- ✅ iOS
- ✅ Android
- ✅ Web

Uses React Native's built-in `Animated` API for cross-platform compatibility.

## Examples

See the "Animated Blooms" section in `/bloom-examples` route for 11+ live examples.
