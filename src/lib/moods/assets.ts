/**
 * Mood assets — files the user brings into a Mood: images (backgrounds,
 * textures, covers), audio (music/sample layers), fonts. Bytes live in the
 * Blob Store by fingerprint; this is the index (name, type, size) and the
 * `asset:<fingerprint>` value syntax any token may use.
 */
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';

export type AssetKind = 'image' | 'audio' | 'font' | 'other';

export interface MoodAsset {
  fingerprint: string;
  name: string;
  type: string;
  size: number;
  kind: AssetKind;
  added: string;
}

export const ASSET_PREFIX = 'asset:';

export function kindOf(type: string, name = ''): AssetKind {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('font/') || /\.(woff2?|ttf|otf)$/i.test(name)) return 'font';
  return 'other';
}

export function isAssetRef(value: string): boolean {
  return value.startsWith(ASSET_PREFIX) && value.length > ASSET_PREFIX.length;
}
export function assetRef(fingerprint: string): string {
  return `${ASSET_PREFIX}${fingerprint}`;
}
export function refFingerprint(value: string): string {
  return value.slice(ASSET_PREFIX.length).trim();
}

const listeners = new Set<() => void>();
export function onAssetsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAssets(): MoodAsset[] {
  const raw = getSetting(SettingsKey.MoodAssets) as string | null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed as MoodAsset[]).filter(
          (a) => a && typeof a.fingerprint === 'string' && typeof a.name === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function write(list: MoodAsset[]) {
  setSetting(SettingsKey.MoodAssets, list.length ? JSON.stringify(list) : '');
  listeners.forEach((fn) => fn());
}

/** Register (or re-register) an asset already in the Blob Store. */
export function addAsset(a: Omit<MoodAsset, 'added' | 'kind'> & { kind?: AssetKind }): MoodAsset {
  const asset: MoodAsset = {
    ...a,
    kind: a.kind ?? kindOf(a.type, a.name),
    added: new Date().toISOString(),
  };
  write([...getAssets().filter((x) => x.fingerprint !== a.fingerprint), asset]);
  return asset;
}

export function removeAsset(fingerprint: string): void {
  write(getAssets().filter((a) => a.fingerprint !== fingerprint));
}

function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Store a File and index it. */
export async function importAssetFile(file: File): Promise<MoodAsset> {
  const { putBlob } = await import('@/services/blobs');
  const fingerprint = await putBlob(file);
  return addAsset({
    fingerprint,
    name: file.name,
    type: file.type || guessType(file.name),
    size: file.size,
  });
}

// ── Resolution: asset:<fp> → url("blob:…") for CSS, cached per session ──────
const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Sync: the object URL if already resolved. */
export function cachedAssetUrl(fingerprint: string): string | null {
  return urlCache.get(fingerprint) ?? null;
}

/** Async: resolve (and cache) an object URL for a fingerprint. */
export function resolveAssetUrl(fingerprint: string): Promise<string | null> {
  const hit = urlCache.get(fingerprint);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(fingerprint);
  if (!p) {
    p = (async () => {
      try {
        const { blobObjectUrl } = await import('@/services/blobs');
        const url = await blobObjectUrl(fingerprint);
        urlCache.set(fingerprint, url);
        return url;
      } catch {
        return null;
      } finally {
        pending.delete(fingerprint);
      }
    })();
    pending.set(fingerprint, p);
  }
  return p;
}

/** CSS value for a token: asset refs become url(), other values pass through. `null` = not resolved yet. */
export function cssValueFor(value: string): string | null {
  if (!isAssetRef(value)) return value;
  const url = cachedAssetUrl(refFingerprint(value));
  return url ? `url("${url}")` : null;
}

// ── Fonts: an asset used as a face gets a stable family name ─────────────────
export const FONT_FACE_FAMILIES: Record<string, string> = {
  fontFaceDisplay: 'MoodFontDisplay',
  fontFaceBody: 'MoodFontBody',
  fontFaceMono: 'MoodFontMono',
};
const loadedFaces = new Map<string, string>(); // family → fingerprint

export async function registerFontFace(family: string, fingerprint: string): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  if (loadedFaces.get(family) === fingerprint) return;
  const url = await resolveAssetUrl(fingerprint);
  if (!url) return;
  try {
    for (const f of Array.from(document.fonts)) if (f.family === family) document.fonts.delete(f);
    const face = new FontFace(family, `url("${url}")`);
    await face.load();
    document.fonts.add(face);
    loadedFaces.set(family, fingerprint);
  } catch (err) {
    console.warn('[mood] font asset failed to load', family, err);
  }
}
