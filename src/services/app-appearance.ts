import { getSetting, setSetting, flushSettings } from './settings';
import { composeMoodPalette } from '@/lib/moods/active';
import { getAssets, isAssetRef, refFingerprint, FONT_FACE_FAMILIES } from '@/lib/moods/assets';
import { readBlob } from './blobs';

export const APPEARANCE_TOKENS = {
  bg: '--bg',
  panel: '--panel',
  surface: '--surface',
  text: '--text',
  muted: '--text-muted',
  accent: '--accent',
  border: '--border',
  selection: '--selection-bg',
  selectionText: '--selection-text',
  input: '--input-bg',
  button: '--action-button',
  buttonText: '--action-button-text',
  hover: '--action-button-hover',
  radius: '--button-radius',
  inputRadius: '--input-radius',
  shadow: '--dropdown-shadow',
  fontBody: '--font-body',
  fontDisplay: '--font-display',
  fontMono: '--font-mono',
  weight: '--font-weight-body',
  displayWeight: '--font-weight-display',
  motion: '--motion-scale',
} as const;
export type AppAppearanceChoice = 'garden' | 'app';
export function appearanceChoice(id: string): AppAppearanceChoice {
  return getSetting(`cruxgarden:app-appearance:${id}`) === 'app' ? 'app' : 'garden';
}
export async function setAppearanceChoice(id: string, value: unknown) {
  if (value !== 'garden' && value !== 'app')
    throw new Error('Choose Garden Mood or app appearance.');
  setSetting(`cruxgarden:app-appearance:${id}`, value);
  await flushSettings();
}
const fontCache = new Map<string, Promise<ArrayBuffer>>();
const bundled = [
  ['Outfit', '/fonts/Outfit-Regular.woff2'],
  ['JetBrains Mono', '/fonts/JetBrainsMono-Regular.woff2'],
  ['Cormorant Garamond', '/fonts/CormorantGaramond-Latin.woff2'],
];
export async function appAppearanceSnapshot(id: string) {
  const css = getComputedStyle(document.documentElement);
  const tokens = Object.fromEntries(
    Object.entries(APPEARANCE_TOKENS).map(([name, variable]) => [
      name,
      css.getPropertyValue(variable).trim(),
    ]),
  );
  for (const [role, cssName] of [
    ['fontBody', '--font-face-body'],
    ['fontDisplay', '--font-face-display'],
    ['fontMono', '--font-face-mono'],
  ]) {
    const face = css.getPropertyValue(cssName!).trim();
    if (face && face !== 'none') tokens[role!] = face;
  }
  const fonts: { family: string; data: ArrayBuffer }[] = [];
  const families = [tokens.fontBody, tokens.fontDisplay, tokens.fontMono].join(',');
  const palette = composeMoodPalette() as Record<string, string>;
  for (const [family, url] of bundled) {
    if (!families.includes(family!)) continue;
    if (!fontCache.has(url!))
      fontCache.set(
        url!,
        fetch(url!).then(async (r) => {
          if (!r.ok) throw new Error('Font unavailable');
          return r.arrayBuffer();
        }),
      );
    try {
      fonts.push({ family: family!, data: await fontCache.get(url!)! });
    } catch {
      /* system fallback */
    }
  }
  for (const [key, family] of Object.entries(FONT_FACE_FAMILIES)) {
    const ref = palette[key];
    if (!ref || !isAssetRef(ref) || !families.includes(family)) continue;
    const fingerprint = refFingerprint(ref);
    if (!getAssets().some((a) => a.fingerprint === fingerprint && a.kind === 'font')) continue;
    try {
      fonts.push({ family, data: (await readBlob(fingerprint)).slice().buffer as ArrayBuffer });
    } catch {
      /* system fallback */
    }
  }
  return {
    choice: appearanceChoice(id),
    mode: document.documentElement.classList.contains('light') ? 'light' : 'dark',
    tokens,
    fonts,
  };
}
