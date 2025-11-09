# ThemeBuilder: Dual Light/Dark Mode Support

## Overview
Feasibility analysis for adding a mode switcher that allows editing both light and dark modes simultaneously, with smart randomization that generates both modes from a single palette.

---

## Current State
- Form holds one mode at a time (`mode: 'light' | 'dark'`)
- Saving only persists the current mode to DTO
- Preview shows current mode only
- DTO structure already supports both modes (good!)

---

## Proposed Changes

### 1. UI: Mode Switcher - Easy ✅
Add a Light/Dark tab below the Details section that switches which mode you're viewing/editing. Similar to the existing bloom color tabs (Primary/Secondary/Tertiary/Quaternary).

**Location:** Between Details section and Palette section

---

### 2. Form State - Medium Complexity ⚠️

Need to restructure `ThemeFormData` to hold BOTH modes simultaneously:

```typescript
interface ThemeFormData {
  // Shared across modes
  title: string;
  description?: string;
  type?: string;
  kind?: string;

  // Per-mode data
  light: {
    // Palette
    backgroundColor?: string;
    panelColor?: string;
    textColor?: string;

    // Content
    borderColor?: string;
    borderWidth?: string;
    borderRadius?: string;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
    font?: string;

    // Bloom (could be mode-specific too)
    primaryColor: ColorValue;
    secondaryColor: ColorValue;
    tertiaryColor: ColorValue;
    quaternaryColor: ColorValue;
    bloomBorderColor?: string;
    bloomBorderWidth?: string;
  };

  dark: {
    // Same fields as light
  };

  // UI state
  activeMode: 'light' | 'dark'; // which tab is currently showing
}
```

**Refactoring needed:**
- Update all `handleFieldChange` calls to target `formData[activeMode].field`
- Update all form inputs to read/write from `formData[activeMode]`
- Update preview to use `formData[activeMode]`

---

### 3. Randomization: Generate Both Modes - Medium-Hard 🤔

**Totally feasible!** Smart approach:

1. Generate one base palette (hue, saturation, lightness, harmony)
2. Use that palette to generate BOTH light and dark modes intelligently

**Strategy:**

```typescript
const randomizeAll = () => {
  // 1. Generate base palette (same as now)
  const randomHue = Math.random() * 360;
  const randomSat = 40 + Math.random() * 50;
  const randomLight = 30 + Math.random() * 40;
  const bloomColors = generatePaletteColors(randomHue, randomSat, randomLight, harmony);

  // 2. Generate LIGHT mode
  const lightBg = chroma.hsl(uiHue, uiSat, 0.92 + Math.random() * 0.06).hex();
  const lightPanel = chroma.hsl(uiHue, uiSat, 0.95 + Math.random() * 0.04).hex();
  const lightText = getReadableTextColor(lightPanel, 4.5);

  // 3. Generate DARK mode (intelligently inverted)
  const darkBg = chroma.hsl(uiHue, uiSat, 0.08 + Math.random() * 0.08).hex();
  const darkPanel = chroma.hsl(uiHue, uiSat, 0.12 + Math.random() * 0.08).hex();
  const darkText = getReadableTextColor(darkPanel, 4.5);

  // 4. Bloom colors: shared OR slightly adjusted
  // Option A: Use same bloom colors for both modes
  // Option B: Brighten bloom colors 10-20% for dark mode (better contrast)
  const darkBloomColors = bloomColors.map(c =>
    chroma(c).brighten(0.1 + Math.random() * 0.1).hex()
  );

  setFormData({
    ...formData,
    light: { /* light mode data */ },
    dark: { /* dark mode data */ },
  });
};
```

**Benefits:**
- Both modes are harmonious (same base palette)
- Both modes are readable (getReadableTextColor ensures contrast)
- Variation adds visual interest between modes
- User can still manually tweak each mode independently

---

## Effort Estimate: **3-5 hours**

### Breakdown:
1. ✏️ **Restructure FormData** (~1 hour)
   - Update interface
   - Add mode state management

2. 🎨 **Add mode switcher UI** (~30 min)
   - Light/Dark tabs (copy bloom tab pattern)
   - Show active mode indicator

3. 🔧 **Update all handlers to be mode-aware** (~1 hour)
   - handleFieldChange
   - All color pickers
   - All text inputs
   - All sliders

4. 🎲 **Update randomization to generate both modes** (~1-2 hours)
   - randomizeAll()
   - randomizeBloom() (both modes)
   - randomizeStyle() (both modes)
   - randomizeDetails() (mode-agnostic, no change)

5. 👁️ **Make preview mode-aware** (~30 min)
   - Switch preview based on activeMode
   - Add visual indicator of which mode is previewing

6. 🧪 **Test everything** (~30 min)
   - Test mode switching
   - Test randomization
   - Test saving (verify DTO structure)
   - Test loading themes back

---

## Implementation Recommendation

### ✅ Worth Doing!

**Pros:**
- DTO structure is already set up for it (meta.palette.light/dark, etc.)
- Powerful feature - design once, get two modes
- Refactoring is straightforward, not tricky
- Randomization can be smart and generate harmonious pairs

**Cons:**
- Moderate amount of work
- Need to be careful with state management
- More UI complexity

---

## Alternative Approach (Faster)

If you want to ship faster, start with:

**Phase 1: "Generate Dark Mode from Light" button**
- Keep single-mode editing
- Add a button that auto-inverts current colors to generate the other mode
- 1-2 hours of work

**Phase 2 (later): Full dual-mode editing**
- Expand to full tab-based editing when needed
- Incremental improvement

---

## Next Steps

1. Decide on approach (full dual-mode vs. auto-generate button)
2. If full dual-mode:
   - Start with FormData restructure
   - Add mode switcher UI
   - Update handlers one section at a time
   - Update randomization last
3. Test thoroughly
4. Celebrate! 🎉

---

## Notes

- The `getReadableTextColor()` function is already perfect for this - it ensures both modes will have good contrast
- Black & white theme generation (15% chance) should work for both modes
- Gradient randomization (25% chance per color) works for both modes
- Consider: Should bloom border colors be different per mode? (Probably yes for best contrast)

---

**Created:** 2025-01-08
**Status:** Planning / Not Started
