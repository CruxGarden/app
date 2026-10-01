import { MOOD_PRESETS } from './presets';

/**
 * The Material Moods (Daniel, 2026-09-19): a material (Plasma, Glass, Soft or Paper), a hue
 * and a mode name one bundled Mood — the soft suite's tone ids, which the
 * Plasma family prefixes with `plasma-`. Everything deeper is a HyperMood.
 */
export type Material = 'plasma' | 'glass' | 'soft' | 'paper';
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

export const PAPER_HUES = ['sunflower', 'lagoon', 'berry'].map((id) => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  light: `expedition-${id}-light`,
  dark: `expedition-${id}-dark`,
}));

export const huesFor = (material: Material) => (material === 'paper' ? PAPER_HUES : HUES);

/** The three choices a worn material Mood's id encodes, or null for a HyperMood. */
export function materialChoice(
  wornId: string | null,
): { material: Material; hue: string; mode: Mode } | null {
  if (!wornId) return null;
  const id = wornId.replace(/^user-/, '');
  for (const hue of PAPER_HUES) {
    if (hue.light === id) return { material: 'paper', hue: hue.id, mode: 'light' };
    if (hue.dark === id) return { material: 'paper', hue: hue.id, mode: 'dark' };
  }
  const material: Material = id.startsWith('plasma-')
    ? 'plasma'
    : id.startsWith('glass-')
      ? 'glass'
      : 'soft';
  const tone = material === 'plasma' || material === 'glass' ? id.slice(material.length + 1) : id;
  for (const h of HUES) {
    if (h.light === tone) return { material, hue: h.id, mode: 'light' };
    if (h.dark === tone) return { material, hue: h.id, mode: 'dark' };
  }
  return null;
}

export function moodIdFor(material: Material, hue: string, mode: Mode): string {
  const hues = huesFor(material);
  const h = hues.find((x) => x.id === hue) ?? hues[0]!;
  const tone = mode === 'light' ? h.light : h.dark;
  return material === 'plasma' || material === 'glass' ? `${material}-${tone}` : tone;
}

/** A hue's swatch colours, read from its presets. */
export function swatch(
  hue: string,
  mode: Mode,
  material: Material = 'soft',
): { bg: string; accent: string } {
  const id = moodIdFor(material, hue, mode);
  const o = MOOD_PRESETS.find((p) => p.id === id)?.overrides ?? {};
  return { bg: o.bg ?? '#888', accent: o.accent ?? '#ccc' };
}
