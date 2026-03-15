/**
 * Mood Palette System
 *
 * Applies element-centric palette tokens as CSS custom properties.
 * No backward compatibility — this IS the palette system.
 */

import { GARDEN_DARK, type MoodPalette, type MoodPaletteKey } from './garden-dark';

export { GARDEN_DARK, type MoodPalette, type MoodPaletteKey };

/**
 * Convert camelCase key to CSS custom property name.
 * e.g. "chatUserBubble" → "--chat-user-bubble"
 */
export function camelToVar(key: string): string {
  return '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Explicit overrides for keys where camelCase → kebab doesn't match
 * the CSS var name the app actually reads.
 */
const VAR_OVERRIDES: Record<string, string> = {
  bloom1: '--bloom-1',
  bloom2: '--bloom-2',
  bloom3: '--bloom-3',
  bloom4: '--bloom-4',
  bloom5: '--bloom-5',
  bloom6: '--bloom-6',
};

/** Pre-computed map of every palette key to its CSS var name */
const VAR_MAP: Record<string, string> = {};
for (const key of Object.keys(GARDEN_DARK)) {
  VAR_MAP[key] = VAR_OVERRIDES[key] || camelToVar(key);
}

/**
 * Apply a mood palette to the document.
 * Sets CSS custom properties for every token.
 * Pass a partial palette to override only specific tokens.
 */
export function applyMoodPalette(
  palette: Partial<MoodPalette>,
  base: MoodPalette = GARDEN_DARK,
) {
  const el = document.documentElement;
  for (const key of Object.keys(base) as MoodPaletteKey[]) {
    const value = palette[key] ?? base[key];
    const cssVar = VAR_MAP[key];
    if (cssVar && value !== undefined) {
      el.style.setProperty(cssVar, String(value));
    }
  }
}

/**
 * Read the current mood palette from computed styles.
 */
export function getCurrentMoodPalette(): MoodPalette {
  const el = document.documentElement;
  const cs = getComputedStyle(el);
  const result = {} as Record<string, string>;
  for (const key of Object.keys(GARDEN_DARK)) {
    const cssVar = VAR_MAP[key];
    result[key] = cs.getPropertyValue(cssVar).trim() || (GARDEN_DARK as Record<string, string>)[key];
  }
  return result as unknown as MoodPalette;
}

/**
 * Get the CSS var name for a palette key.
 */
export function getVar(key: MoodPaletteKey): string {
  return VAR_MAP[key] || camelToVar(key);
}
