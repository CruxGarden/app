# Theme Builder Dual Mode Implementation Progress

## Status: In Progress

## Completed Steps

Step 1: Restructure Types in types.ts

- Added ThemeModeData interface
- Updated ThemeFormData to have light/dark/activeMode
- Updated formDataToDto to save both modes
- Updated dtoToFormData to load both modes
- Updated getDefaultThemeFormData to initialize both modes

Step 2: Update helper functions and preview

- Updated getBloomProps to use activeMode
- Updated getFontFamily to use activeMode
- Updated preview title to show "Preview - Light Mode" or "Preview - Dark Mode"
- Updated preview container and sample panel to use formData[activeMode]

Step 3: Add mode switcher UI

- Added Light/Dark tabs between Details and Palette sections
- Tabs update formData.activeMode when clicked

Step 4: Update handlers

- Added handleModeFieldChange for per-mode fields
- Updated handleColorChange to use handleModeFieldChange

Step 5: Update all form inputs to use activeMode

- Updated bloom border controls
- Updated bloom color pickers and tabs
- Updated all Content section inputs (border, background, panel, text, font)
- Updated palette preview fallback colors
- Added styles for mode tabs

Step 6: Update randomization functions

- Updated randomizeStyle() to generate both light and dark modes intelligently
- Updated randomizeBloom() to generate identical bloom colors for both modes
- Updated handleGenerateUIColors() (Apply Palette) to apply to current active mode only
- Updated randomizeAll() to generate complete dual-mode themes from one palette

Step 7: Fix TypeScript errors

- Fixed slider type issues for borderWidth, borderRadius, bloomBorderWidth
- Fixed chroma.contrast type issue with null assertions

## Status: COMPLETE

Implementation finished successfully!

## Recent Updates (Post-Initial Implementation)

### Fix 1: Light/Dark Mode Inversion

- **Issue**: Dark Mode was showing light backgrounds and vice versa
- **Fix**: Updated `generateBackgroundAndPanel` to respect `isDark` parameter even in unconstrained mode
  - Dark Mode: 0-40% lightness
  - Light Mode: 60-100% lightness

### Fix 2: Apply Palette Now Affects Both Modes

- **Issue**: Apply Palette only affected the active mode, inconsistent with randomize buttons
- **Fix**: Updated `handleGenerateUIColors` to generate both light and dark modes simultaneously
  - Same bloom colors for both modes
  - Different UI colors (backgrounds/text) appropriate for each mode
  - Identical bloom border for both modes

### Fix 3: AAA Contrast Guarantee

- **Issue**: Auto-generated palettes didn't guarantee WCAG AAA (7.0:1) contrast
- **Fix**: Created `getAAATextColor` helper function that guarantees AAA contrast
  - Updated `handleGenerateUIColors` (Apply Palette)
  - Updated `randomizeStyle`
  - Updated `randomizeAll`
  - All auto-generated text now passes AAA contrast standards

### Fix 4: Missing Bloom Colors in JSON Output

- **Issue**: Solid bloom colors (non-gradient) were omitted from JSON output
- **Fix**: Updated `formDataToDto` to always output all four bloom colors
  - Gradient colors: output with `{ gradient: {...} }`
  - Solid colors: output with `{ solid: "#ffffff" }`
  - Ensures consistent JSON structure with all four bloom entries always present
- **Also Updated**:
  - Updated `ThemeMeta` interface to include `solid?: string` property
  - Updated `dtoToFormData` to handle loading solid colors from JSON

### Feature: Controls Section (Buttons and Links)

- **New Section**: Added Controls section for button and link styling
- **Type Updates**:
  - Added button properties to `ThemeModeData`: `buttonBackgroundColor`, `buttonTextColor`, `buttonBorderColor`, `buttonBorderWidth`, `buttonBorderStyle`
  - Added link properties to `ThemeModeData`: `linkColor`, `linkUnderlineStyle`
  - Updated `ThemeMeta` to include `controls` section for light/dark modes
- **UI Components**:
  - Added Controls collapsible section with randomize button
  - Button inputs: background color, text color, border color, border width (slider), border style (solid/dashed/dotted)
  - Link inputs: color, underline style (none/underline/always)
- **Randomization**:
  - Created `randomizeControls` function - derives colors from palette with AAA contrast
  - Updated `randomizeAll` to generate controls for both modes
  - Updated `randomizeStyle` to generate controls for both modes
- **Preview**:
  - Added sample button to preview panel
  - Added sample link to preview panel
  - Both update in real-time with current mode settings
- **Data Handling**:
  - Controls saved/loaded in JSON via `formDataToDto` and `dtoToFormData`
  - Per-mode support (different controls for light/dark)

### Enhancement: Gradient Support for Buttons

- **Created CruxButton Component** (`/app/components/CruxButton/index.tsx`):
  - Custom button component using `Pressable` (as requested)
  - Supports both solid colors and gradients (like CruxBloom)
  - Uses `expo-linear-gradient` for gradient backgrounds
  - Supports border color, width, style, and custom fonts
  - Text color with proper contrast

- **Updated Button Background Type**:
  - Changed `buttonBackgroundColor` from `string` to `ColorValue` type
  - Updated `ThemeMeta` interface to store button gradients/solids in JSON
  - Updated `formDataToDto` and `dtoToFormData` converters

- **Updated UI**:
  - Button Background input now uses `ColorPicker` (supports gradient/solid toggle)
  - Preview uses `CruxButton` component instead of native `Button`
  - Displays gradient buttons in real-time

- **Updated Randomization**:
  - All randomize functions (`randomizeControls`, `randomizeStyle`, `randomizeAll`) now support gradients
  - 25% chance to generate gradient buttons
  - Gradient angles randomized
  - Text color guarantees AAA contrast on gradient backgrounds

## Next Steps

- Step 1: Restructure types.ts
  - Add ThemeModeData interface
  - Update ThemeFormData to have light/dark/activeMode
  - Update formDataToDto to save both modes
  - Update dtoToFormData to load both modes
  - Update getDefaultThemeFormData to initialize both modes

- Step 2: Add mode switcher UI between Details and Palette

- Step 3: Update handlers to be mode-aware

- Step 4: Update all inputs to read/write formData[activeMode]

- Step 5: Update preview to show activeMode and indicator text

- Step 6: Update randomizeAll() for both modes

- Step 7: Update Apply Palette for current mode only

- Step 8: Update randomizeBloom() for both modes

- Step 9: Update randomizeStyle() for both modes

- Step 10: Test everything

## Notes

- All randomize buttons regenerate BOTH modes
- Bloom colors identical on generation but saved separately
- Apply Palette only affects current active mode
- Preview shows "Preview - Light Mode" or "Preview - Dark Mode"
