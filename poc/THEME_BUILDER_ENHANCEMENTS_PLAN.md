# Theme Builder Enhancements Plan

## Overview

This document outlines the implementation plan for four major enhancements to the Theme Builder:

1. Drop shadows on bloom, button, and panel
2. Gradient support for background and panel
3. Transparency/opacity controls for panel and button
4. Font size adjustment (small/medium/large)
5. Update the highlight text color

---

## 1. Drop Shadow Support

### Affected Components

- CruxBloom (bloom shadows)
- CruxButton (button shadows)
- Preview panel (panel shadows)

### Implementation Steps

#### Step 1.1: Update Types (`types.ts`)

Add shadow properties to `ThemeModeData`:

```typescript
// Bloom shadow
bloomShadowEnabled?: boolean;
bloomShadowColor?: string;
bloomShadowOffsetX?: string;
bloomShadowOffsetY?: string;
bloomShadowBlurRadius?: string;
bloomShadowOpacity?: string;

// Button shadow
buttonShadowEnabled?: boolean;
buttonShadowColor?: string;
buttonShadowOffsetX?: string;
buttonShadowOffsetY?: string;
buttonShadowBlurRadius?: string;
buttonShadowOpacity?: string;

// Panel shadow
panelShadowEnabled?: boolean;
panelShadowColor?: string;
panelShadowOffsetX?: string;
panelShadowOffsetY?: string;
panelShadowBlurRadius?: string;
panelShadowOpacity?: string;
```

Add to `ThemeMeta` interface for JSON serialization.

Update `formDataToDto` and `dtoToFormData` converters.

Update `getDefaultThemeFormData` with sensible defaults:

- Bloom: subtle shadow (2px, 4px, 8px blur, 0.15 opacity)
- Button: medium shadow (0px, 2px, 4px blur, 0.1 opacity)
- Panel: light shadow (0px, 1px, 3px blur, 0.05 opacity)

#### Step 1.2: Update CruxBloom Component

Add shadow props to `CruxBloomProps`:

```typescript
shadowEnabled?: boolean;
shadowColor?: string;
shadowOffset?: { width: number; height: number };
shadowBlurRadius?: number;
shadowOpacity?: number;
```

Apply shadow using React Native's `shadow*` style properties (iOS) and `elevation` (Android).

#### Step 1.3: Update CruxButton Component

Add same shadow props as CruxBloom.

Apply shadow styling to Pressable wrapper.

#### Step 1.4: Update ThemeBuilder UI

Add collapsible "Shadows" section with three subsections:

- **Bloom Shadow**
  - Enable toggle
  - Shadow color picker (HexColorInput)
  - X/Y offset sliders (-20 to 20)
  - Blur radius slider (0 to 30)
  - Opacity slider (0 to 1, step 0.05)

- **Button Shadow**
  - Same controls as bloom

- **Panel Shadow**
  - Same controls as bloom

#### Step 1.5: Update Preview

Apply panel shadow to sample panel container in preview.

Update CruxBloom and CruxButton usage to include shadow props.

#### Step 1.6: Update Randomization Functions

All randomize functions should generate:

- Random enable/disable (50% chance for bloom/button, 30% for panel)
- Shadow color: black with 0.1-0.3 opacity
- Offset: 0-8px for X, 2-6px for Y
- Blur radius: 4-12px
- Opacity: 0.05-0.2

---

## 2. Gradient Support for Background & Panel

### Implementation Steps

#### Step 2.1: Update Types (`types.ts`)

Change `backgroundColor` and `panelColor` from `string` to `ColorValue`:

```typescript
backgroundColor?: ColorValue;  // Was: string
panelColor?: ColorValue;       // Was: string
```

Update JSON serialization in `ThemeMeta`:

```typescript
content?: {
  light?: {
    background?: {
      gradient?: GradientDefinition;
      solid?: string;
    };
    panel?: {
      gradient?: GradientDefinition;
      solid?: string;
    };
    // ... other fields
  };
  // ... dark mode
};
```

Update converters (`formDataToDto`, `dtoToFormData`).

#### Step 2.2: Update ThemeBuilder UI

Replace `HexColorInput` with `ColorPicker` for:

- Background Color
- Panel Color

Users can now toggle between solid and gradient for each.

#### Step 2.3: Update Preview Rendering

Background: Use LinearGradient component if gradient, otherwise solid View.

Panel: Same approach - wrap in LinearGradient if needed.

Extract helper function to render gradient or solid background:

```typescript
const renderBackground = (colorValue: ColorValue, style: any) => {
  if (colorValue.type === 'gradient') {
    return <LinearGradient colors={...} style={style} />;
  }
  return <View style={[style, { backgroundColor: colorValue.value }]} />;
};
```

#### Step 2.4: Update Randomization Functions

Background/panel gradients:

- 15% chance for gradients (vs 25% for blooms/buttons)
- Vertical or diagonal angles (90°, 135°, 180°)
- Use palette colors for gradient stops

---

## 3. Transparency/Opacity Controls

### Implementation Steps

#### Step 3.1: Update Types (`types.ts`)

Add opacity properties:

```typescript
panelOpacity?: string;        // 0-1 as string
buttonOpacity?: string;       // 0-1 as string
```

Add to `ThemeMeta` for JSON serialization.

Update converters.

Defaults:

- Panel opacity: 1.0 (fully opaque)
- Button opacity: 1.0 (fully opaque)

#### Step 3.2: Update CruxButton Component

Add `opacity?: number` prop.

Apply to Pressable wrapper style.

#### Step 3.3: Update ThemeBuilder UI

Add opacity sliders:

- In **Content** section: Panel Opacity (0-1, step 0.05)
- In **Controls** section: Button Opacity (0-1, step 0.05)

Display as percentage in label (e.g., "Panel Opacity: 85%").

#### Step 3.4: Update Preview

Apply `panelOpacity` to sample panel container.

Pass `buttonOpacity` to CruxButton component.

#### Step 3.5: Update Randomization Functions

Random opacity:

- 80% chance: fully opaque (1.0)
- 20% chance: 0.85-0.95 (slight transparency)

This keeps most themes solid while allowing occasional transparency effects.

---

## 4. Font Size Adjustment

### Implementation Steps

#### Step 4.1: Update Types (`types.ts`)

Add to `ThemeModeData`:

```typescript
fontSize?: 'small' | 'medium' | 'large';
```

Add to `ThemeMeta.content` for JSON serialization.

Update converters.

Default: `'medium'`

#### Step 4.2: Define Font Size Scales

In ThemeBuilder component, define size mappings:

```typescript
const fontSizes = {
  small: {
    base: 14,
    heading: 20,
    subheading: 16,
  },
  medium: {
    base: 16,
    heading: 24,
    subheading: 18,
  },
  large: {
    base: 18,
    heading: 28,
    subheading: 20,
  },
};
```

#### Step 4.3: Update ThemeBuilder UI

Add to **Content** section:

- Font Size toggle (similar to Font Family)
- Three buttons: Small / Medium / Large
- Highlight active selection

#### Step 4.4: Update Preview Rendering

Create helper function to get font size:

```typescript
const getFontSize = (type: 'base' | 'heading' | 'subheading') => {
  const size = formData[formData.activeMode].fontSize || 'medium';
  return fontSizes[size][type];
};
```

Apply to all text in preview:

- Title: heading size
- Description: base size
- Sample text: base size
- Button text: base size
- Link text: base size

#### Step 4.5: Add to JSON Output

Include `fontSize` in meta content for both modes.

**Note**: This is a display preference, not actually stored text sizes. Apps consuming the theme can use this to scale their typography.

#### Step 4.6: Update Randomization Functions

Random font size:

- 40% small
- 40% medium
- 20% large

---

## Implementation Order

### Phase 1: Low Complexity

1. **Font Size Adjustment** (simplest - just string property + toggle)
2. **Transparency Controls** (simple - just opacity sliders)

### Phase 2: Medium Complexity

3. **Background/Panel Gradients** (moderate - reuse existing ColorPicker)

### Phase 3: High Complexity

4. **Drop Shadows** (most complex - many properties, platform differences)

---

## Testing Checklist

### For Each Feature

- [ ] Light mode works correctly
- [ ] Dark mode works correctly
- [ ] Apply Palette button respects setting
- [ ] Randomize buttons generate appropriate values
- [ ] JSON export includes all properties
- [ ] JSON import loads properties correctly
- [ ] Preview updates in real-time
- [ ] Default values are sensible

### Cross-Feature Testing

- [ ] Gradient backgrounds with transparent panels
- [ ] Shadows work with gradients
- [ ] Font sizes scale consistently
- [ ] All randomize functions work together

---

## Notes

### React Native Shadow Limitations

- iOS uses `shadow*` properties
- Android uses `elevation`
- May need platform-specific handling
- Consider using `react-native-shadow-2` for consistent cross-platform shadows

### Performance Considerations

- Gradients are heavier than solid colors
- Too many shadows can impact performance
- Consider debouncing opacity slider updates
- Limit simultaneous gradients in preview

### Accessibility

- Ensure sufficient contrast with transparency
- Font sizes should have meaningful differences
- Shadow colors should enhance, not obscure
- Test with various color schemes

### Future Enhancements

- Shadow presets (none, subtle, medium, strong)
- Gradient presets (vertical, horizontal, radial, angled)
- Font size custom values (not just S/M/L)
- Animation support for shadows/gradients
