/** The background selection owns its displayed URL and pending image reads. */
import { getSetting, setSetting } from './settings';
import { BG_CSS_VAR, SettingsKey } from '@/lib/constants';
import { BgType } from '@/lib/types';
import { useMoodStore } from '@/stores/moodStore';

let selection = 0;
let ownedUrl: string | null = null;

function display(url: string | null, owned = false) {
  const previous = ownedUrl;
  ownedUrl = owned ? url : null;
  useMoodStore.setState({ backgroundUrl: url });
  if (previous && previous !== url) URL.revokeObjectURL(previous);
}

function saveType(type: BgType) {
  setSetting(SettingsKey.BackgroundType, type);
  if (typeof document !== 'undefined') document.documentElement.style.setProperty(BG_CSS_VAR, type);
}

async function resolveImage(
  fingerprint: string,
  request: number,
  borrowedUrl?: string,
): Promise<string> {
  let resolved = borrowedUrl ?? null;
  if (!resolved && fingerprint && typeof URL.createObjectURL === 'function') {
    const { blobObjectUrl } = await import('./blobs');
    if (request !== selection) return '';
    resolved = await blobObjectUrl(fingerprint).catch(() => null);
  }
  const owned = !!resolved && borrowedUrl === undefined;
  if (request !== selection) {
    if (owned) URL.revokeObjectURL(resolved!);
    return '';
  }
  display(resolved, owned);
  return resolved ?? '';
}

/** Switch background type; image restores the saved selection with its own URL. */
export async function setBackgroundType(type: BgType): Promise<void> {
  const request = ++selection;
  saveType(type);
  if (type !== BgType.Image) display(null);
  else {
    const fingerprint = getSetting(SettingsKey.BackgroundImage);
    if (fingerprint) await resolveImage(fingerprint, request);
  }
}

/** Optional ready URLs are borrowed (bundled/data URLs); the caller retains ownership. */
export async function setBackgroundImage(fingerprint: string, url?: string): Promise<string> {
  const request = ++selection;
  setSetting(SettingsKey.BackgroundImage, fingerprint);
  saveType(BgType.Image);
  return resolveImage(fingerprint, request, url);
}

/** Claim the selection before generation/upload; a later choice always wins. */
export async function setBackgroundFromBlob(source: Blob | Promise<Blob>): Promise<string> {
  const request = ++selection;
  const blob = await source;
  if (request !== selection) return '';
  const { putBlob } = await import('./blobs');
  if (request !== selection) return '';
  const fingerprint = await putBlob(blob);
  if (request !== selection) return '';
  return setBackgroundImage(fingerprint);
}

/** Paint a shipped URL while the saved image loads; never supersede that read. */
export function showBackgroundFallback(url: string): void {
  if (
    !useMoodStore.getState().backgroundUrl &&
    getSetting(SettingsKey.BackgroundType) === BgType.Image
  )
    display(url);
}

export async function clearBackgroundImage(): Promise<void> {
  setSetting(SettingsKey.BackgroundImage, '');
  await setBackgroundType(BgType.Bloom);
}
