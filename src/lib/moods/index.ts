/**
 * Mood Palette System
 *
 * Applies element-centric palette tokens as CSS custom properties.
 * No backward compatibility — this IS the palette system.
 */

import { GARDEN_DARK, type MoodPalette, type MoodPaletteKey } from './garden-dark';
import {
  cssValueFor,
  isAssetRef,
  refFingerprint,
  resolveAssetUrl,
  registerFontFace,
  FONT_FACE_FAMILIES,
} from './assets';

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
/** Mix two hex colors: bg blended with amount% of fg */
function mixHex(bg: string, fg: string, amount: number): string {
  if (!bg.startsWith('#') || !fg.startsWith('#')) return bg;
  const t = amount / 100;
  const br = parseInt(bg.slice(1, 3), 16),
    bg2 = parseInt(bg.slice(3, 5), 16),
    bb = parseInt(bg.slice(5, 7), 16);
  const fr = parseInt(fg.slice(1, 3), 16),
    fg2 = parseInt(fg.slice(3, 5), 16),
    fb = parseInt(fg.slice(5, 7), 16);
  const r = Math.round(br + (fr - br) * t)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(bg2 + (fg2 - bg2) * t)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(bb + (fb - bb) * t)
    .toString(16)
    .padStart(2, '0');
  return `#${r}${g}${b}`;
}

export function applyMoodPalette(palette: Partial<MoodPalette>, base: MoodPalette = GARDEN_DARK) {
  const el = document.documentElement;

  // Auto-compute accentMuted if accent and bg are provided but accentMuted is not
  const bg = palette.bg ?? base.bg;
  const accent = palette.accent ?? base.accent;
  if (
    !palette.accentMuted &&
    typeof bg === 'string' &&
    typeof accent === 'string' &&
    bg.startsWith('#') &&
    accent.startsWith('#')
  ) {
    palette = { ...palette, accentMuted: mixHex(bg, accent, 15) };
  }

  const unresolved: { cssVar: string; fingerprint: string }[] = [];
  for (const key of Object.keys(base) as MoodPaletteKey[]) {
    const value = palette[key] ?? base[key];
    const cssVar = VAR_MAP[key];
    if (!cssVar || value === undefined) continue;
    const raw = String(value);
    if (key in FONT_FACE_FAMILIES) {
      // A font asset: register the face; the family name is what font tokens use
      if (isAssetRef(raw)) void registerFontFace(FONT_FACE_FAMILIES[key]!, refFingerprint(raw));
      el.style.setProperty(cssVar, isAssetRef(raw) ? `'${FONT_FACE_FAMILIES[key]}'` : 'none');
      continue;
    }
    const css = cssValueFor(raw);
    if (css === null) {
      // asset not resolved yet: paint nothing, fill in when the URL arrives
      el.style.setProperty(cssVar, 'none');
      unresolved.push({ cssVar, fingerprint: refFingerprint(raw) });
    } else {
      el.style.setProperty(cssVar, css);
    }
  }
  for (const u of unresolved) {
    void resolveAssetUrl(u.fingerprint).then((url) => {
      if (url) el.style.setProperty(u.cssVar, `url("${url}")`);
    });
  }
  // Notify Monaco and other listeners that the palette changed
  // Delay slightly so var() references resolve before Monaco reads computed styles
  requestAnimationFrame(() => {
    document.dispatchEvent(new Event('palette-change'));
  });
}

/**
 * Read the current mood palette from computed styles.
 */
export function getCurrentMoodPalette(): MoodPalette {
  const el = document.documentElement;
  const cs = getComputedStyle(el);
  const result = {} as Record<string, string>;
  for (const key of Object.keys(GARDEN_DARK)) {
    const cssVar = VAR_MAP[key] || camelToVar(key);
    result[key] =
      cs.getPropertyValue(cssVar).trim() || (GARDEN_DARK as Record<string, string>)[key] || '';
  }
  return result as unknown as MoodPalette;
}

/**
 * Get the CSS var name for a palette key.
 */
export function getVar(key: MoodPaletteKey): string {
  return VAR_MAP[key] || camelToVar(key);
}
