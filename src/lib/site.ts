/**
 * The public website (crux.garden) is this same app built with
 * VITE_PUBLIC_SITE=1: `/` is the landing page, builder routes redirect there,
 * and the public routes (/explore, /:username, /:username/:slug) stay. Web Mode
 * (the browser builder) remains available for development without the flag.
 */
import { isDesktop } from './platform';

export const GITHUB_ORG_URL = 'https://github.com/CruxGarden';
export const GITHUB_APP_URL = 'https://github.com/CruxGarden/app';
export const RELEASES_URL = `${GITHUB_APP_URL}/releases`;
export const LATEST_RELEASE_API = 'https://api.github.com/repos/CruxGarden/app/releases/latest';
export const CONTACT_EMAIL = 'keeper@crux.garden';

export function isPublicSite(): boolean {
  return !isDesktop() && import.meta.env.VITE_PUBLIC_SITE === '1';
}

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

export interface LatestDownload {
  version: string;
  url: string;
  arch: 'arm64' | 'x64';
  size: number | null;
  /** all macOS DMGs in the release, for the "other Mac" link */
  all: { arch: 'arm64' | 'x64'; url: string }[];
}

/** Apple silicon or Intel, from what the browser tells us (defaults to arm64). */
export function detectMacArch(
  nav: Partial<Navigator> | undefined = globalThis.navigator,
): 'arm64' | 'x64' {
  const ua = (nav?.userAgent ?? '').toLowerCase();
  const uaData = (nav as { userAgentData?: { architecture?: string } } | undefined)?.userAgentData;
  if (uaData?.architecture) return uaData.architecture === 'x86' ? 'x64' : 'arm64';
  if (/intel mac os x/.test(ua) && !/arm|apple/.test(ua)) {
    // Safari on Apple silicon also says "Intel" — only trust it when WebGL says Intel too.
    return 'x64';
  }
  return 'arm64';
}

/** Pick the DMG for an arch from a GitHub release's assets (pure, testable). */
export function pickDownload(
  tagName: string,
  assets: ReleaseAsset[],
  arch: 'arm64' | 'x64',
): LatestDownload | null {
  const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name));
  const all = dmgs
    .map((a) => ({
      arch: (/x64|intel/i.test(a.name) ? 'x64' : 'arm64') as 'arm64' | 'x64',
      url: a.browser_download_url,
      size: a.size ?? null,
    }))
    .sort((a, b) => a.arch.localeCompare(b.arch));
  if (all.length === 0) return null;
  const chosen = all.find((a) => a.arch === arch) ?? all[0]!;
  return {
    version: tagName.replace(/^v/, ''),
    url: chosen.url,
    arch: chosen.arch,
    size: chosen.size,
    all: all.map(({ arch: a, url }) => ({ arch: a, url })),
  };
}

/** Latest desktop release from GitHub, or null when offline / no release yet. */
export async function fetchLatestDownload(
  arch: 'arm64' | 'x64' = detectMacArch(),
): Promise<LatestDownload | null> {
  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; assets?: ReleaseAsset[] };
    return pickDownload(body.tag_name ?? '', body.assets ?? [], arch);
  } catch {
    return null;
  }
}
