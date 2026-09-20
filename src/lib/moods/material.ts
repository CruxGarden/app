import { MOOD_PRESETS } from './presets';

/**
 * The Material Moods (Daniel, 2026-09-19): a material (Plasma or Soft), a hue
 * and a mode name one bundled Mood — the soft suite's tone ids, which the
 * Plasma family prefixes with `plasma-`. Everything deeper is a HyperMood.
 */
export type Material = 'plasma' | 'soft';
export type Mode = 'light' | 'dark';

/** Each hue's light and dark tone id (the soft suite's ids; the Plasma family prefixes them). */
export const HUES: { id: string; name: string; light: string; dark: string }[] = [
  { id: 'neutral', name: 'Neutral', light: 'soft-white', dark: 'soft-black' },
  { id: 'gray', name: 'Gray', light: 'soft-gray', dark: 'graphite' },
  { id: 'parchment', name: 'Parchment', light: 'parchment', dark: 'umber' },
  { id: 'fjord', name: 'Fjord', light: 'fjord', dark: 'harbor' },
  { id: 'blush', name: 'Blush', light: 'blush', dark: 'mulberry' },
  { id: 'sage', name: 'Sage', light: 'sage', dark: 'moss' },
  { id: 'lilac', name: 'Lilac', light: 'lilac', dark: 'plum' },
];

/** The three choices a worn material Mood's id encodes, or null for a HyperMood. */
export function materialChoice(
  wornId: string | null,
): { material: Material; hue: string; mode: Mode } | null {
  if (!wornId) return null;
  const id = wornId.replace(/^user-/, '');
  const material: Material = id.startsWith('plasma-') ? 'plasma' : 'soft';
  const tone = material === 'plasma' ? id.slice('plasma-'.length) : id;
  for (const h of HUES) {
    if (h.light === tone) return { material, hue: h.id, mode: 'light' };
    if (h.dark === tone) return { material, hue: h.id, mode: 'dark' };
  }
  return null;
}

export function moodIdFor(material: Material, hue: string, mode: Mode): string {
  const h = HUES.find((x) => x.id === hue) ?? HUES[0]!;
  const tone = mode === 'light' ? h.light : h.dark;
  return material === 'plasma' ? `plasma-${tone}` : tone;
}

/** A hue's swatch colours, read from its presets. */
export function swatch(hue: string, mode: Mode): { bg: string; accent: string } {
  const id = moodIdFor('soft', hue, mode);
  const o = MOOD_PRESETS.find((p) => p.id === id)?.overrides ?? {};
  return { bg: o.bg ?? '#888', accent: o.accent ?? '#ccc' };
}
