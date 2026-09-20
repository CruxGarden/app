/**
 * A surface leaving under Plasma (Daniel, 2026-09-19: "contents fade out,
 * plasma collapses — all very fast"): the pane's contents fade first, while
 * the element still stands, and only then is the pane taken out of the
 * layout — at which point the material forms out from the box it had. Under
 * any other surface, or with the form-out off, the pane just goes.
 */
export const LEAVING_ATTR = 'data-plasma-leaving';
export const LEAVE_MS = 110;

export function leaveSurface(selector: string, then: () => void): void {
  const html = document.documentElement;
  const el = document.querySelector<HTMLElement>(selector);
  const plasma = html.dataset.surfaceStyle === 'plasma';
  const formOut = getComputedStyle(html).getPropertyValue('--plasma-form-out').trim() !== 'off';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!el || !plasma || !formOut || reduced || el.hasAttribute(LEAVING_ATTR)) return then();
  el.setAttribute(LEAVING_ATTR, '');
  setTimeout(then, LEAVE_MS);
}
