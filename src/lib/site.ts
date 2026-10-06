/**
 * The public website (crux.garden) is this same app built with
 * VITE_PUBLIC_SITE=1: `/` is the landing page, builder routes redirect there,
 * and the public routes (/explore, /:username, /:username/:slug) stay. Web Mode
 * (the browser builder) remains available for development without the flag.
 */
import { isDesktop } from './platform';

export const GITHUB_APP_URL = 'https://github.com/CruxGarden/app';
export const RELEASES_URL = `${GITHUB_APP_URL}/releases`;
export const LICENSE_URL = `${GITHUB_APP_URL}/blob/main/LICENSE`;
export const WEBSITE_URL = 'https://crux.garden';

export function isPublicSite(): boolean {
  return !isDesktop() && import.meta.env.VITE_PUBLIC_SITE === '1';
}

/** Where people file problems when no contact address is configured for this build. */
export const ISSUES_URL = `${GITHUB_APP_URL}/issues`;

/** The website's own pages that are neither a garden nor a creation. */
export const LEGAL_PAGES = [
  { path: '/terms', label: 'Terms' },
  { path: '/privacy', label: 'Privacy' },
  { path: '/contact', label: 'Contact' },
] as const;
export type LegalPath = (typeof LEGAL_PAGES)[number]['path'];

/**
 * First path segments the website keeps for itself. A garden lives at
 * `/{username}`, so a person with one of these names would have a public
 * address the router never reaches. The API owns username acceptance; this
 * list is the app's record of what must be refused there too.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'explore',
  'plans',
  'billing',
  'docs',
  'blog',
  'subscribed',
  'home',
  'c',
  'terms',
  'privacy',
  'contact',
  'operator',
  'sitemap.xml',
  'robots.txt',
  'assets',
  'fonts',
];

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.includes(username.replace(/^@/, '').trim().toLowerCase());
}

/** The contact address for this build, when one was configured; never invented. */
export function contactEmail(): string | null {
  const value = String(import.meta.env.VITE_CONTACT_EMAIL ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

/** How to reach the people who run the service: an address when set, the issue tracker otherwise. */
export function contactTarget(): { kind: 'email' | 'issues'; href: string; label: string } {
  const email = contactEmail();
  return email
    ? { kind: 'email', href: `mailto:${email}`, label: email }
    : { kind: 'issues', href: ISSUES_URL, label: 'GitHub issues' };
}
