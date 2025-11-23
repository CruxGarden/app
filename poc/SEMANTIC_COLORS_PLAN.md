# Semantic Color Derivation Plan

## Overview

Automatically derive semantic UI colors (primary, secondary, accent) from the theme's bloom palette colors. This creates automatic cohesion between the bloom identity and UI elements throughout the app.

## Current State

### Existing Color System

- `background` - App background color
- `panel` - Surface color for cards/panels
- `text` - Text color
- `border` - Border color
- `buttonBackground` - Explicit button color
- `buttonText` - Explicit button text color
- `linkColor` - Explicit link color
- Bloom colors: `primary`, `secondary`, `tertiary`, `quaternary`

### Issues

- ❌ UI colors disconnected from bloom identity
- ❌ Manual color picking for every element
- ❌ Hard to create cohesive themes
- ❌ Bloom is just decoration, not integrated

## Proposed Solution

### Semantic Color Mapping

Automatically derive UI colors from bloom palette:

```typescript
// Bloom → UI Mapping
bloom.quaternary  → colors.primary     // Brightest bloom = primary actions
bloom.tertiary    → colors.secondary   // Mid-tone = secondary actions
bloom.secondary   → colors.accent      // Deeper tone = accents/highlights
bloom.primary     → (reserved/unused)  // Darkest (optional use)

// Surface System (keep existing)
content.panelColor       → colors.surface
content.backgroundColor  → colors.background
content.textColor        → colors.onSurface / colors.onBackground
content.borderColor      → colors.outline
```

### Benefits

- ✅ Automatic cohesion - Bloom identity flows through entire UI
- ✅ Fewer decisions - Focus on bloom + surfaces
- ✅ Smart defaults - Brightness guides usage
- ✅ Still flexible - Can override if needed
- ✅ Consistent - All actions/links/accents use bloom colors

## Implementation Plan

### Phase 1: Color Utilities

**File:** `app/utils/colorUtils.ts` (new)

Create helper functions:

- `calculateLuminance(hexColor: string): number` - Calculate relative luminance
- `getContrastColor(bgColor: string): string` - Return '#000000' or '#ffffff' for best contrast
- `hexToRgb(hex: string): { r, g, b }` - Convert hex to RGB
- `getColorBrightness(hexColor: string): number` - Simple brightness calculation

```typescript
/**
 * Calculate relative luminance (0-1)
 * https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
export function calculateLuminance(hexColor: string): number;

/**
 * Get contrasting text color (black or white)
 * Based on WCAG contrast guidelines
 */
export function getContrastColor(bgColor: string): string;
```

### Phase 2: Update Design Tokens

**File:** `app/utils/designTokens.ts`

Update `DesignTokens` interface:

```typescript
export interface DesignTokens {
  colors: {
    // Semantic colors (new)
    primary: string; // Derived from bloom.quaternary
    onPrimary: string; // Auto-calculated contrast
    secondary: string; // Derived from bloom.tertiary
    onSecondary: string; // Auto-calculated contrast
    accent: string; // Derived from bloom.secondary
    onAccent: string; // Auto-calculated contrast

    // Surface system (existing)
    background: string;
    surface: string;
    surfaceVariant: string;
    onBackground: string;
    onSurface: string;
    outline: string;
    outlineVariant: string;

    // Legacy aliases (for backward compatibility)
    panel: string; // → surface
    text: string; // → onSurface
    border: string; // → outline
    buttonBackground: string; // → primary
    buttonText: string; // → onPrimary
    linkColor: string; // → primary

    // Bloom colors (pass-through for CruxBloom component)
    bloomPrimary: ColorValue;
    bloomSecondary: ColorValue;
    bloomTertiary: ColorValue;
    bloomQuaternary: ColorValue;
    bloomBorder?: string;

    // Other (keep existing)
    selection: string;
  };
  // ... rest of tokens
}
```

Update `computeDesignTokens()`:

```typescript
export function computeDesignTokens(theme: Theme, mode: 'light' | 'dark'): DesignTokens {
  const palette = theme.meta.palette?.[mode];
  const bloom = theme.meta.bloom?.[mode];
  const content = theme.meta.content?.[mode];
  const controls = theme.meta.controls?.[mode];

  // Extract bloom colors (solid values only for UI usage)
  const bloomQuaternary = extractSolidColor(bloom?.quaternary);
  const bloomTertiary = extractSolidColor(bloom?.tertiary);
  const bloomSecondary = extractSolidColor(bloom?.secondary);

  // Derive semantic colors from bloom
  const primary = bloomQuaternary || '#4dd9b8';
  const secondary = bloomTertiary || '#2d9d8c';
  const accent = bloomSecondary || '#1a8873';

  // Calculate contrasting text colors
  const onPrimary = getContrastColor(primary);
  const onSecondary = getContrastColor(secondary);
  const onAccent = getContrastColor(accent);

  // Surface colors
  const background = content?.backgroundColor || (mode === 'dark' ? '#0f1214' : '#f5f7f8');
  const surface = content?.panelColor || (mode === 'dark' ? '#1a1f24' : '#ffffff');
  const onSurface = content?.textColor || (mode === 'dark' ? '#e8eef2' : '#0f1214');

  return {
    colors: {
      // Semantic colors
      primary,
      onPrimary,
      secondary,
      onSecondary,
      accent,
      onAccent,

      // Surface system
      background,
      surface,
      surfaceVariant: surface, // Could derive lighter/darker
      onBackground: onSurface,
      onSurface,
      outline: content?.borderColor || '#cccccc',
      outlineVariant: content?.borderColor || '#e8e8e8',

      // Legacy aliases
      panel: surface,
      text: onSurface,
      border: content?.borderColor || '#cccccc',
      buttonBackground: primary,
      buttonText: onPrimary,
      link: primary,

      // Bloom (pass-through)
      bloomPrimary: bloom?.primary,
      bloomSecondary: bloom?.secondary,
      bloomTertiary: bloom?.tertiary,
      bloomQuaternary: bloom?.quaternary,
      bloomBorder: bloom?.borderColor,

      selection: content?.selectionColor || '#b3d9ff',
    },
    // ... rest of tokens
  };
}

function extractSolidColor(colorValue?: ColorValue): string | undefined {
  if (!colorValue) return undefined;
  return colorValue.type === 'solid' ? colorValue.value : undefined;
}
```

### Phase 3: Update Components

Update components to use semantic colors:

**Button** (`app/components/Button.tsx`)

```typescript
// Before:
backgroundColor: isPrimary ? tokens.colors.buttonBackground : tokens.colors.panel;

// After:
backgroundColor: isPrimary ? tokens.colors.primary : tokens.colors.surface;
textColor: isPrimary ? tokens.colors.onPrimary : tokens.colors.onSurface;
```

**Panel** (`app/components/Panel.tsx`)

```typescript
// Use semantic names
backgroundColor: tokens.colors.surface;
borderColor: tokens.colors.outline;
```

**TextInput** (`app/components/TextInput.tsx`)

```typescript
// Could use surfaceVariant for inputs
backgroundColor: tokens.colors.surfaceVariant || tokens.colors.surface;
borderColor: tokens.colors.outline;
```

**Links/Text with color**

```typescript
// Links use primary color
<Text color={tokens.colors.primary}>Link</Text>
```

### Phase 4: Add surfaceVariant Derivation

Automatically create a lighter/darker variant of surface for inputs:

```typescript
function deriveSurfaceVariant(surface: string, mode: 'light' | 'dark'): string {
  // In light mode: slightly darker than surface
  // In dark mode: slightly lighter than surface
  const rgb = hexToRgb(surface);
  const adjustment = mode === 'light' ? -10 : +10;

  return rgbToHex({
    r: Math.max(0, Math.min(255, rgb.r + adjustment)),
    g: Math.max(0, Math.min(255, rgb.g + adjustment)),
    b: Math.max(0, Math.min(255, rgb.b + adjustment)),
  });
}
```

### Phase 5: Theme Builder Updates (Optional)

Add visual indicators showing the derivation:

```typescript
// In Theme Builder preview, show:
"Primary Actions (from Quaternary): [color swatch]"
"Secondary Actions (from Tertiary): [color swatch]"
"Accents (from Secondary): [color swatch]"

// Maybe add override options:
[ ] Use custom action colors instead of bloom derivation
```

## Migration Strategy

### Backward Compatibility

1. **Keep legacy aliases** - Old code continues working:
   - `tokens.colors.buttonBackground` → maps to `primary`
   - `tokens.colors.panel` → maps to `surface`
   - `tokens.colors.text` → maps to `onSurface`

2. **Gradual migration** - Update components incrementally:
   - Phase 1: Add semantic colors alongside legacy
   - Phase 2: Update components one by one
   - Phase 3: Eventually deprecate legacy names

3. **No breaking changes** - Existing themes work immediately

## Testing Plan

### Visual Testing

1. **Apply various themes** and verify:
   - Actions use bright bloom colors
   - Buttons have good contrast
   - Links are visible
   - Panels/surfaces look correct

2. **Toggle light/dark mode** and verify:
   - All colors adapt properly
   - Contrast remains good in both modes
   - Animations still smooth

3. **Test extreme cases**:
   - Very dark bloom colors
   - Very light bloom colors
   - Grayscale themes
   - High contrast themes

### Automated Tests (Optional)

```typescript
describe('Semantic Color Derivation', () => {
  it('derives primary from bloom quaternary', () => {
    const tokens = computeDesignTokens(testTheme, 'light');
    expect(tokens.colors.primary).toBe('#047057'); // bloom.quaternary
  });

  it('calculates contrasting text color', () => {
    const darkBg = getContrastColor('#047057');
    expect(darkBg).toBe('#ffffff'); // White on dark

    const lightBg = getContrastColor('#f5f7f8');
    expect(lightBg).toBe('#000000'); // Black on light
  });

  it('maintains backward compatibility', () => {
    const tokens = computeDesignTokens(testTheme, 'light');
    expect(tokens.colors.buttonBackground).toBe(tokens.colors.primary);
  });
});
```

## Success Criteria

- ✅ Bloom colors automatically flow into UI elements
- ✅ All themes have cohesive color schemes
- ✅ Good contrast automatically calculated
- ✅ No breaking changes to existing themes
- ✅ Theme builder remains simple
- ✅ Animations work smoothly with new color system

## Future Enhancements

### Phase 2 (Optional)

- Add manual override option in theme builder
- "Use custom action colors" checkbox
- Smart color suggestions based on bloom
- Accessibility score (WCAG contrast checker)

### Phase 3 (Optional)

- Color harmony analysis
- Suggest complementary accents
- Auto-generate color variations
- Export color palette documentation

## Files to Create/Modify

### New Files

- [ ] `app/utils/colorUtils.ts` - Color calculation helpers

### Modified Files

- [ ] `app/utils/designTokens.ts` - Update token computation
- [ ] `app/components/Button.tsx` - Use semantic colors
- [ ] `app/components/Panel.tsx` - Use semantic colors
- [ ] `app/components/TextInput.tsx` - Use semantic colors
- [ ] `app/components/Section.tsx` - Use semantic colors
- [ ] Other components as needed

### Documentation

- [ ] Add examples to `ThemeBuilder/README.md`
- [ ] Update this plan with implementation notes

## Timeline Estimate

- **Phase 1** (Color Utilities): 30 minutes
- **Phase 2** (Design Tokens): 1 hour
- **Phase 3** (Update Components): 1-2 hours
- **Phase 4** (surfaceVariant): 30 minutes
- **Phase 5** (Theme Builder): 1 hour (optional)
- **Testing**: 1 hour

**Total: 4-6 hours** (3-4 hours for core functionality)

## Notes

- Start with Phase 1-3 for core functionality
- Phase 4-5 are nice-to-have enhancements
- Can implement incrementally
- Test thoroughly with different theme styles
- Keep backward compatibility throughout
