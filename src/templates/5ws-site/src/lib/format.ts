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

/** The readouts: two fixed digits — `04:37`, `PTS 08` — so nothing shifts as they change. */
export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

/** `{ mm, ss }` of the clock readout, so the colon between them can be its own element. */
export function clockParts(ms: number): { mm: string; ss: string } {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return { mm: pad2(Math.floor(s / 60)), ss: pad2(s % 60) };
}

/** Looks like a web address a kept page can point at. */
export function isWebUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}
