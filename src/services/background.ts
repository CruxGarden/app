/**
 * The Mood background: bloom / drift / flow / blank, or an image in the Blob
 * Store. One place for the three writes that must agree (setting, CSS var,
 * mood store) — the Background tab and the AI's set_background both use it.
 */
import { getSetting, setSetting } from './settings';
import { BG_CSS_VAR, SettingsKey } from '@/lib/constants';
import { BgType } from '@/lib/types';

export const BACKGROUND_TYPES: BgType[] = [BgType.Bloom, BgType.Drift, BgType.Flow, BgType.Blank];

export function currentBackgroundType(): BgType {
  const saved = getSetting(SettingsKey.BackgroundType) as string | null;
  return (Object.values(BgType) as string[]).includes(saved ?? '')
    ? (saved as BgType)
    : BgType.Bloom;
}

async function applyToStore(patch: { backgroundUrl: string | null }) {
  const { useMoodStore } = await import('@/stores/moodStore');
  useMoodStore.setState(patch);
}

/** Switch to a generated background (bloom/drift/flow/blank). */
export async function setBackgroundType(type: BgType): Promise<void> {
  setSetting(SettingsKey.BackgroundType, type);
  if (typeof document !== 'undefined') document.documentElement.style.setProperty(BG_CSS_VAR, type);
  if (type !== BgType.Image) await applyToStore({ backgroundUrl: null });
}

/**
 * Use an image already in the Blob Store as the background. `url` may be a
 * ready object/data URL (avoids a re-read); otherwise it is resolved here.
 */
export async function setBackgroundImage(fingerprint: string, url?: string): Promise<string> {
  setSetting(SettingsKey.BackgroundImage, fingerprint);
  setSetting(SettingsKey.BackgroundType, BgType.Image);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty(BG_CSS_VAR, BgType.Image);
  }
  let resolved = url ?? null;
  if (!resolved && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const { blobObjectUrl } = await import('./blobs');
    resolved = await blobObjectUrl(fingerprint).catch(() => null);
  }
  await applyToStore({ backgroundUrl: resolved });
  return resolved ?? '';
}

/** Store image bytes and make them the background. */
export async function setBackgroundFromBlob(blob: Blob | File): Promise<string> {
  const { putBlob } = await import('./blobs');
  const fingerprint = await putBlob(blob);
  return setBackgroundImage(fingerprint);
}

/** Back to bloom, forgetting the stored image reference. */
export async function clearBackgroundImage(): Promise<void> {
  setSetting(SettingsKey.BackgroundImage, '');
  await setBackgroundType(BgType.Bloom);
}
