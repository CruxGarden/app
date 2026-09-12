import type { FontAtlas } from '@/fonts/types';
import { SYSTEM_FONTS } from '@/fonts/system-fonts';
// The local edition offers installed/system fonts. No remote font downloads.
const atlas: FontAtlas = { fonts: {} };
export const getCachedFontAtlas = () => atlas;
export const clearFontAtlasCache = () => {};
export const loadFontAtlas = async () => atlas;
export async function loadFullFont({ family }: { family: string; weights?: number[] }) {
  if (!SYSTEM_FONTS.has(family)) throw Error('This local edition uses system fonts. Choose a font available on this device.');
  await document.fonts.load(`16px "${family.replace(/"/g, '\\"')}"`);
}
export async function loadFonts({ families }: { families: string[] }) {
  await Promise.all(families.map(family => loadFullFont({ family })));
}
