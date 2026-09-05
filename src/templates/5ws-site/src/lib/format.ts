/** Small formatting shared by the Round island and its tests. */

/** Search: DuckDuckGo with a bare `q` — no tracking parameters. */
export const SEARCH_URL = 'https://duckduckgo.com/?q=';

export function searchUrlFor(term: string): string {
  return SEARCH_URL + encodeURIComponent(term.trim());
}

/** mm:ss, counting down (ceil, so 4:59.2 still reads 5:00 until a whole second has gone). */
export function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Looks like a web address a kept page can point at. */
export function isWebUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}
