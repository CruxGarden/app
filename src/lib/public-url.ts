import { Capability, can } from '@/lib/platform';
/**
 * Where a published crux lives for other people.
 *
 * The app used `window.location.origin` for this, which is right in the
 * browser and wrong on desktop: the packaged shell is served from
 * `crux-app://`, so "your site is live at" produced an address nobody could
 * open — including the button that copies it to the clipboard.
 */

/** The crux.garden origin, whatever the app itself is being served from. */
export function gardenOrigin(): string {
  const configured = import.meta.env.VITE_APP_URL;
  if (configured) return String(configured).replace(/\/$/, '');
  // A real web origin (production or `npm run dev`) is its own answer.
  if (typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)) {
    return window.location.origin;
  }
  // Desktop: crux-app:// — fall back to the public site.
  return 'https://crux.garden';
}

/** The public page for a published crux: https://crux.garden/{username}/{slug} */
export function publicCruxUrl(username: string, slug: string): string {
  const user = username.startsWith('@') ? username.slice(1) : username;
  return `${gardenOrigin()}/${user}/${slug}`;
}

// Where a crux's PUBLISHED FILES are served from (distinct from its public
// page on crux.garden). Per-crux subdomain in production; legacy flat prefix;
// same-origin service-worker preview in local dev.
const PUBLISH_ORIGIN_TEMPLATE = import.meta.env.VITE_PUBLISH_ORIGIN_TEMPLATE || '';
const PUBLISHED_CONTENT_URL = import.meta.env.VITE_PUBLISHED_CONTENT_URL || '';

/** The exact origin the published-crux iframe will have — the only origin allowed to talk to us. */
export function publishOriginFor(cruxId: string): string {
  if (PUBLISH_ORIGIN_TEMPLATE) return PUBLISH_ORIGIN_TEMPLATE.replace('{cruxId}', cruxId);
  if (PUBLISHED_CONTENT_URL) return new URL(`${PUBLISHED_CONTENT_URL}/${cruxId}/`).origin;
  return window.location.origin;
}

/** True when published files are served from a per-crux or flat remote origin (not the SW fallback). */
export function hasRemotePublishOrigin(): boolean {
  return !!(PUBLISH_ORIGIN_TEMPLATE || PUBLISHED_CONTENT_URL);
}

/** Base URL for a published file path: `${publishBaseUrlFor(id)}/${path}`. */
export function publishBaseUrlFor(cruxId: string): string {
  if (PUBLISH_ORIGIN_TEMPLATE) return PUBLISH_ORIGIN_TEMPLATE.replace('{cruxId}', cruxId);
  return `${PUBLISHED_CONTENT_URL}/${cruxId}`;
}

/**
 * Open a crux.garden page (a public garden, a published crux) for the user.
 * In the browser that's a new tab; on desktop `window.open` is denied by the
 * shell (nothing may navigate the app), so it goes to the system browser.
 */
export async function openGardenPage(path: string): Promise<void> {
  const url = path.startsWith('http')
    ? path
    : `${gardenOrigin()}${path.startsWith('/') ? '' : '/'}${path}`;
  if (can(Capability.DesktopChrome)) {
    const { openExternal } = await import('@/services/desktop');
    await openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
