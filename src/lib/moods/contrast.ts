/**
 * How readable a Mood's words are (WCAG 2 contrast). The Mood editor measures
 * the colours the browser actually resolved — tokens can be color-mix(),
 * rgb() with alpha, or references to other tokens — and warns when text falls
 * under 4.5:1 against the surface it sits on (UX pass, 2026-09-27: people
 * build their own Moods, and legibility must survive them).
 */

export type Rgba = [number, number, number, number];

/** A computed CSS colour — `rgb(…)`, `rgba(…)` or `color(srgb …)` — as 0–255 channels and 0–1 alpha. */
export function parseCssColor(value: string): Rgba | null {
  const v = value.trim();
  const rgb =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (rgb) {
    const a = rgb[4] === undefined ? 1 : alpha(rgb[4]);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), a];
  }
  const srgb =
    /^color\(\s*srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (srgb) {
    const a = srgb[4] === undefined ? 1 : alpha(srgb[4]);
    return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, a];
  }
  return null;
}

function alpha(text: string): number {
  return text.endsWith('%') ? Number(text.slice(0, -1)) / 100 : Number(text);
}

/** `top` laid over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [
    top[0] * a + bottom[0] * (1 - a),
    top[1] * a + bottom[1] * (1 - a),
    top[2] * a + bottom[2] * (1 - a),
    1,
  ];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: Rgba): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque colours (1 to 21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** The pairs worth checking, as token names: [words, what they sit on, what that sits on]. */
export const CONTRAST_PAIRS = [
  { label: 'Text on panels', text: '--text', surface: '--panel' },
  { label: 'Quiet text on panels', text: '--text-muted', surface: '--panel' },
  { label: 'Text on the page', text: '--text', surface: '--bg' },
  { label: 'Accent on panels', text: '--accent', surface: '--panel' },
] as const;

export const READABLE = 4.5;
