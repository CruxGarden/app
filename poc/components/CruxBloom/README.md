# CruxBloom Component

A simple, elegant React component for rendering the Crux Garden icon with customizable colors, borders, and gradients.

## Features

- 🎨 **Individual circle customization** - Control colors, opacity, borders for each of the 4 circles
- 🌈 **Gradient support** - Linear gradients with multiple stops and configurable angles
- 🎭 **Theme presets** - 10+ pre-configured themes ready to use
- 🔧 **Type-safe** - Full TypeScript support with comprehensive types
- ⚡ **Simple & performant** - Focused on core features without unnecessary complexity

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
<CruxBloom size={100} />;
```

## Customization Examples

### Custom Colors

```tsx
<CruxBloom
  size={150}
  primary={{ fill: '#ff0000' }}
  secondary={{ fill: '#00ff00' }}
  tertiary={{ fill: '#0000ff' }}
  quaternary={{ fill: '#ffff00' }}
/>
```

### With Borders

```tsx
<CruxBloom
  size={150}
  primary={{ fill: '#2a3d2c', stroke: '#ffffff', strokeWidth: 10 }}
  secondary={{ fill: '#426046', stroke: '#cccccc', strokeWidth: 8 }}
  tertiary={{ fill: '#58825e', stroke: '#aaaaaa', strokeWidth: 6 }}
  quaternary={{ fill: '#73a079', stroke: '#888888', strokeWidth: 4 }}
/>
```

### With Opacity

```tsx
<CruxBloom
  size={150}
  primary={{ fill: '#9b59b6', opacity: 0.3 }}
  secondary={{ fill: '#9b59b6', opacity: 0.5 }}
  tertiary={{ fill: '#9b59b6', opacity: 0.7 }}
  quaternary={{ fill: '#9b59b6', opacity: 1 }}
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
        { color: '#feca57', offset: '100%' },
      ],
      angle: 135,
    },
  ]}
  primary={{ fill: 'url(#sunset)', opacity: 0.4 }}
  secondary={{ fill: 'url(#sunset)', opacity: 0.6 }}
  tertiary={{ fill: 'url(#sunset)', opacity: 0.8 }}
  quaternary={{ fill: 'url(#sunset)', opacity: 1 }}
/>
```

### Glowing Borders

```tsx
<CruxBloom
  size={150}
  primary={{ fill: '#1a1a1a', stroke: '#00ffff', strokeWidth: 6, opacity: 0.8 }}
  secondary={{ fill: '#1a1a1a', stroke: '#00ff00', strokeWidth: 5, opacity: 0.85 }}
  tertiary={{ fill: '#1a1a1a', stroke: '#ffff00', strokeWidth: 4, opacity: 0.9 }}
  quaternary={{ fill: '#ffffff', stroke: '#ff00ff', strokeWidth: 3 }}
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
  quaternary={{ fill: '#ffffff' }}
/>
```

### Available Preset Themes

- `default` - Original Crux Garden colors
- `oceanBreeze` - Cool ocean-inspired gradients
- `sunsetGlow` - Warm sunset colors with bloom effect
- `forestShadow` - Deep forest greens with subtle borders
- `twilightDream` - Ethereal twilight colors
- `fireBurst` - Explosive fire colors
- `midnightRing` - Dark theme with glowing borders
- `auroraShift` - Aurora gradient with varying opacity
- `lavenderDream` - Soft lavender gradient
- `vibrantRainbow` - Bold rainbow colors

## Creating Custom Themes

```tsx
import { createCruxBloomTheme, createMonochromaticTheme } from '@/components/CruxBloom/types';

// Create a custom theme
const myTheme = createCruxBloomTheme(
  'My Custom Theme',
  {
    primary: { fill: '#ff0000', opacity: 0.5 },
    secondary: { fill: '#00ff00', opacity: 0.6 },
    tertiary: { fill: '#0000ff', opacity: 0.7 },
    quaternary: { fill: '#ffff00', opacity: 1 },
  },
  'A vibrant custom theme'
);

// Use it
<CruxBloom size={150} {...myTheme.config} />;

// Create a monochromatic theme
const blueTheme = createMonochromaticTheme('Blue Theme', '#3498db', {
  lighten: true,
  withBorders: true,
});

<CruxBloom size={150} {...blueTheme.config} />;
```

## Advanced: Multiple Gradients

```tsx
import { PRESET_GRADIENTS } from '@/components/CruxBloom/types';

<CruxBloom
  size={150}
  gradients={[
    PRESET_GRADIENTS.sunset,
    PRESET_GRADIENTS.ocean,
    PRESET_GRADIENTS.forest,
    PRESET_GRADIENTS.lavender,
  ]}
  primary={{ fill: 'url(#sunset)' }}
  secondary={{ fill: 'url(#ocean)' }}
  tertiary={{ fill: 'url(#forest)' }}
  quaternary={{ fill: 'url(#lavender)' }}
/>;
```

## Available Preset Gradients

- `sunset` - Warm red to yellow gradient
- `ocean` - Cool blue gradient
- `forest` - Deep green gradient
- `twilight` - Dark blue gradient
- `fire` - Red to orange gradient
- `midnight` - Dark gray gradient
- `aurora` - Cyan to green gradient
- `lavender` - Purple gradient

## API Reference

### CruxBloomProps

| Prop         | Type                   | Default        | Description                   |
| ------------ | ---------------------- | -------------- | ----------------------------- |
| `size`       | `number`               | `100`          | Size in pixels (width/height) |
| `width`      | `number`               | `2000`         | ViewBox width                 |
| `height`     | `number`               | `2000`         | ViewBox height                |
| `primary`    | `CircleStyle`          | See defaults   | Outermost circle (r=1000)     |
| `secondary`  | `CircleStyle`          | See defaults   | Second circle (r=750)         |
| `tertiary`   | `CircleStyle`          | See defaults   | Third circle (r=500)          |
| `quaternary` | `CircleStyle`          | See defaults   | Innermost circle (r=250)      |
| `gradients`  | `GradientDefinition[]` | `[]`           | Array of gradient definitions |
| `style`      | `any`                  | -              | Additional SVG styles         |
| `testID`     | `string`               | `'crux-bloom'` | Test identifier               |

### CircleStyle

| Property      | Type     | Description                                   |
| ------------- | -------- | --------------------------------------------- |
| `fill`        | `string` | Fill color or gradient reference (`url(#id)`) |
| `stroke`      | `string` | Border color                                  |
| `strokeWidth` | `number` | Border width                                  |
| `opacity`     | `number` | Opacity (0-1)                                 |

### GradientDefinition

| Property | Type                               | Description                           |
| -------- | ---------------------------------- | ------------------------------------- |
| `id`     | `string`                           | Unique gradient ID                    |
| `stops`  | `Array<{color, offset, opacity?}>` | Gradient color stops                  |
| `angle`  | `number`                           | Gradient angle in degrees (0=→, 90=↓) |
| `type`   | `'linear' \| 'radial'`             | Gradient type (linear only for now)   |

## Default Circle Positions

The component uses these fixed values for the cascade effect:

- **Primary**: Center (1000, 1000), radius 1000, offset 0, color #2a3d2c
- **Secondary**: Center (1000, 1137), radius 750, offset 137, color #426046
- **Tertiary**: Center (1000, 1276), radius 500, offset 276, color #58825e
- **Quaternary**: Center (1000, 1421), radius 250, offset 421, color #73a079

The radii and offsets are fixed to maintain the iconic Crux Garden bloom shape.

## Platform Support

This component works on:

- ✅ iOS
- ✅ Android
- ✅ Web

It uses `react-native-svg` which is cross-platform compatible.

## Performance Tips

1. **Reuse gradient definitions** - Define gradients once and reference them multiple times
2. **Use opacity carefully** - Too many overlapping semi-transparent circles can impact rendering
3. **Static themes** - For static blooms, consider memoizing the component

## Examples in Action

See the full examples gallery at `/bloom-examples` route in the app for 20+ live examples showcasing different combinations of colors, borders, gradients, and opacity.

## Design Philosophy

CruxBloom is intentionally kept simple and focused:

- **Fixed structure** - Four circles with predetermined sizes and cascade offsets
- **Style focused** - Customize appearance through colors, borders, gradients, and opacity
- **No transformations** - No rotation, skew, or shape changes to keep it simple
- **Predictable** - Same structure every time, just styled differently

This makes it easy to create beautiful variations while maintaining the iconic Crux Garden identity.
