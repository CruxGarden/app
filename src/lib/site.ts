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

export type MacArch = 'arm64' | 'x64';
/** What the browser lets us conclude; 'unknown' means "offer every Mac build". */
export type DetectedArch = MacArch | 'unknown';

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size?: number;
}

export interface LatestDownload {
  version: string;
  url: string;
  arch: MacArch;
  size: number | null;
  /** False when `arch` is only a default (detection was inconclusive) — show every Mac build. */
  detected: boolean;
  /** all macOS DMGs in the release, for the "other Mac" link */
  all: { arch: MacArch; url: string }[];
}

/** Map a Client Hints `architecture` value ("arm" / "x86") to a Mac arch. */
export function archFromClientHint(architecture: string | undefined | null): DetectedArch {
  if (architecture === 'arm') return 'arm64';
  if (architecture === 'x86') return 'x64';
  return 'unknown';
}

/**
 * Map a WEBGL_debug_renderer_info renderer string to a Mac arch. Chromium and
 * Firefox name the GPU ("ANGLE (Apple, ANGLE Metal Renderer: Apple M2, …)",
 * "ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics 640, …)", "AMD Radeon Pro …").
 * Safari says "Apple GPU" on every Mac, Intel included — that stays unknown.
 */
export function archFromRenderer(renderer: string | null | undefined): DetectedArch {
  if (!renderer) return 'unknown';
  if (/apple m\d/i.test(renderer)) return 'arm64';
  if (/\b(intel|amd|radeon|nvidia|geforce)\b/i.test(renderer)) return 'x64';
  return 'unknown';
}

function webglRenderer(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (!gl || !ext) return null;
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch {
    return null;
  }
}

interface NavigatorWithHints {
  userAgent?: string;
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
}

/**
 * Apple silicon or Intel, from what the browser tells us. The UA string is
 * useless for this — every Mac browser says "Intel Mac OS X", and "AppleWebKit"
 * appears everywhere — so: (1) Client Hints' high-entropy `architecture`
 * (Chromium only; async, and not on the low-entropy object), (2) the WebGL
 * renderer name, (3) 'unknown', which the download UI shows as both builds.
 */
export async function detectMacArch(
  nav: NavigatorWithHints | undefined = globalThis.navigator as NavigatorWithHints | undefined,
  readRenderer: () => string | null = webglRenderer,
): Promise<DetectedArch> {
  const ua = nav?.userAgent ?? '';
  if (!/Macintosh|Mac OS X/i.test(ua)) return 'unknown';
  const hints = nav?.userAgentData;
  if (hints?.getHighEntropyValues) {
    try {
      const { architecture } = await hints.getHighEntropyValues(['architecture']);
      const fromHint = archFromClientHint(architecture);
      if (fromHint !== 'unknown') return fromHint;
    } catch {
      // the browser may refuse high-entropy hints; fall through to WebGL
    }
  }
  return archFromRenderer(readRenderer());
}

/** Pick the DMG for an arch from a GitHub release's assets (pure, testable). */
export function pickDownload(
  tagName: string,
  assets: ReleaseAsset[],
  arch: DetectedArch,
): LatestDownload | null {
  const dmgs = assets.filter((a) => /\.dmg$/i.test(a.name));
  const all = dmgs
    .map((a) => ({
      arch: (/x64|intel/i.test(a.name) ? 'x64' : 'arm64') as MacArch,
      url: a.browser_download_url,
      size: a.size ?? null,
    }))
    .sort((a, b) => a.arch.localeCompare(b.arch));
  if (all.length === 0) return null;
  const matched = arch === 'unknown' ? undefined : all.find((a) => a.arch === arch);
  const chosen = matched ?? all.find((a) => a.arch === 'arm64') ?? all[0]!;
  return {
    version: tagName.replace(/^v/, ''),
    url: chosen.url,
    arch: chosen.arch,
    size: chosen.size,
    detected: matched !== undefined,
    all: all.map(({ arch: a, url }) => ({ arch: a, url })),
  };
}

/** Latest desktop release from GitHub, or null when offline / no release yet. */
export async function fetchLatestDownload(arch?: DetectedArch): Promise<LatestDownload | null> {
  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; assets?: ReleaseAsset[] };
    return pickDownload(body.tag_name ?? '', body.assets ?? [], arch ?? (await detectMacArch()));
  } catch {
    return null;
  }
}
