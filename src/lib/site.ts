/**
 * The public website (crux.garden) is this same app built with
 * VITE_PUBLIC_SITE=1: `/` is the landing page, builder routes redirect there,
 * and the public routes (/explore, /:username, /:username/:slug) stay. Web Mode
 * (the browser builder) remains available for development without the flag.
 */
import { isDesktop } from './platform';

export const GITHUB_APP_URL = 'https://github.com/CruxGarden/app';
export const RELEASES_URL = `${GITHUB_APP_URL}/releases`;

export function isPublicSite(): boolean {
  return !isDesktop() && import.meta.env.VITE_PUBLIC_SITE === '1';
}
