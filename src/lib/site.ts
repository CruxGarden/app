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

export type Platform = 'mac' | 'windows' | 'linux' | 'unknown';
export type DownloadKind = 'dmg' | 'exe' | 'AppImage' | 'deb';

/** One installer in a release, classified from its file name. */
export interface DownloadOption {
  platform: Exclude<Platform, 'unknown'>;
  kind: DownloadKind;
  /** Mac builds carry the chip; Windows and Linux ship x64 only. */
  arch: MacArch;
  url: string;
  size: number | null;
  /** Short label for a link: "Apple silicon", "Intel", "Windows", "Linux AppImage", "Debian / Ubuntu .deb" */
  label: string;
}

export interface LatestDownload {
  version: string;
  /** The primary button. */
  url: string;
  platform: Exclude<Platform, 'unknown'>;
  kind: DownloadKind;
  arch: MacArch;
  size: number | null;
  /** False when the primary is only a default (no platform or chip detected) — show every build. */
  detected: boolean;
  /** all macOS DMGs in the release, for the "other Mac" link */
  all: { arch: MacArch; url: string }[];
  /** Every installer in the release, for the "other platforms" links. */
  options: DownloadOption[];
}

/**
 * Which desktop OS the visitor is on, from the UA string alone — that much it
 * does say. Phones and tablets are 'unknown' on purpose: there is nothing to
 * install there, so the page offers every build instead of guessing.
 */
export function detectPlatform(
  nav: { userAgent?: string } | undefined = globalThis.navigator as
    | { userAgent?: string }
    | undefined,
): Platform {
  const ua = nav?.userAgent ?? '';
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) return 'unknown';
  if (/Windows NT/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return 'unknown';
}

/** Classify a release asset by name; null for updater manifests, zips, blockmaps and the like. */
export function classifyAsset(a: ReleaseAsset): DownloadOption | null {
  const base = { url: a.browser_download_url, size: a.size ?? null };
  if (/\.dmg$/i.test(a.name)) {
    const arch: MacArch = /x64|intel/i.test(a.name) ? 'x64' : 'arm64';
    return {
      ...base,
      platform: 'mac',
      kind: 'dmg',
      arch,
      label: arch === 'arm64' ? 'Apple silicon' : 'Intel',
    };
  }
  if (/\.exe$/i.test(a.name)) {
    return { ...base, platform: 'windows', kind: 'exe', arch: 'x64', label: 'Windows' };
  }
  if (/\.AppImage$/i.test(a.name)) {
    return { ...base, platform: 'linux', kind: 'AppImage', arch: 'x64', label: 'Linux AppImage' };
  }
  if (/\.deb$/i.test(a.name)) {
    return { ...base, platform: 'linux', kind: 'deb', arch: 'x64', label: 'Debian / Ubuntu .deb' };
  }
  return null;
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

/**
 * Pick the primary installer for a visitor from a GitHub release's assets
 * (pure, testable). Mac visitors get the DMG for their chip; Windows the
 * installer; Linux the AppImage (the .deb stays one click away). When the
 * platform is unknown, or the release has nothing for it, the primary is the
 * Apple silicon DMG with `detected: false`, and the page shows every build.
 */
export function pickDownload(
  tagName: string,
  assets: ReleaseAsset[],
  arch: DetectedArch,
  platform: Platform = 'mac',
): LatestDownload | null {
  const options = assets
    .map(classifyAsset)
    .filter((o): o is DownloadOption => o !== null)
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.arch.localeCompare(b.arch));
  const macs = options.filter((o) => o.platform === 'mac');
  const all = macs.map(({ arch: a, url }) => ({ arch: a, url }));
  if (options.length === 0) return null;

  let chosen: DownloadOption | undefined;
  if (platform === 'mac' && arch !== 'unknown') chosen = macs.find((o) => o.arch === arch);
  else if (platform === 'windows') chosen = options.find((o) => o.platform === 'windows');
  else if (platform === 'linux')
    chosen =
      options.find((o) => o.kind === 'AppImage') ?? options.find((o) => o.platform === 'linux');
  const detected = chosen !== undefined;
  chosen ??= macs.find((o) => o.arch === 'arm64') ?? options[0]!;
  return {
    version: tagName.replace(/^v/, ''),
    url: chosen.url,
    platform: chosen.platform,
    kind: chosen.kind,
    arch: chosen.arch,
    size: chosen.size,
    detected,
    all,
    options,
  };
}

/** Latest desktop release from GitHub, or null when offline / no release yet. */
export async function fetchLatestDownload(
  arch?: DetectedArch,
  platform: Platform = detectPlatform(),
): Promise<LatestDownload | null> {
  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { tag_name?: string; assets?: ReleaseAsset[] };
    const macArch = arch ?? (platform === 'mac' ? await detectMacArch() : 'unknown');
    return pickDownload(body.tag_name ?? '', body.assets ?? [], macArch, platform);
  } catch {
    return null;
  }
}
