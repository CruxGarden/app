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
