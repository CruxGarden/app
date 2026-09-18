import type { PlasmaProviderProps } from '@cruxgarden/plasma-ui';

/**
 * Quality tiers for the Plasma material, in the sense a game means it.
 *
 * Every plasma pass is full-viewport, so the cost follows the canvas and the
 * machine, not the number of panes. A 2019 laptop cannot hold a frame at the
 * settings an M-series desktop does not notice, and the honest answer is the
 * one games settled on decades ago: turn things down rather than off, and let
 * the person choose. Turning it off entirely is a different control — that is
 * the surface style, which falls back to Glass or Solid.
 *
 * `quality` is the dominant term, and it is a *cap* on the device pixel
 * ratio, not a multiplier: the renderer draws at min(devicePixelRatio,
 * quality). So on an ordinary 1080p monitor, where dpr is 1, every value at or
 * above 1 draws exactly the same number of pixels and the tier changes
 * nothing. That is why `low` goes below 1 — it is the only tier that can
 * shrink the canvas on the machines that most need it. Above 1 the tiers
 * separate on Retina and other HiDPI screens, where dpr is 2 and the cap
 * decides how much of it is used.
 *
 * The rest are effects that each cost a pass or a chunk of one — the blur
 * chains behind `frost`, the extra geometry behind `ambientDrops`, the
 * per-frame displacement behind `flow`.
 *
 * The renderer also clamps itself at 2.6 megapixels however high quality goes,
 * so the worst case is bounded: a 4K display does not cost 4K of plasma.
 */
export type PlasmaTier = 'low' | 'medium' | 'high' | 'ultra';

export const PLASMA_TIERS: Record<PlasmaTier, Partial<PlasmaProviderProps>> = {
  // Below one device pixel per CSS pixel: the canvas is CSS-scaled back up, so
  // the field softens and the cost drops by the square. The only tier that
  // helps a weak GPU on a 1080p screen.
  low: { quality: 0.7, frost: 0, pointerDrop: false, ambientDrops: false, flow: 0, stretch: 0.5 },
  medium: { quality: 1, frost: 0.2, pointerDrop: true, ambientDrops: false, flow: 0, stretch: 1 },
  // The default, and what the workspace example looks like.
  high: { quality: 1.25, frost: 0.35, pointerDrop: true, ambientDrops: false, flow: 0, stretch: 1 },
  ultra: { quality: 1.75, frost: 0.45, pointerDrop: true, ambientDrops: true, flow: 0.4, stretch: 1.4 },
};

export const DEFAULT_TIER: PlasmaTier = 'high';

export function isTier(v: unknown): v is PlasmaTier {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'ultra';
}

/** The tier <html data-plasma-tier> asks for, or the default. */
export function readTier(): PlasmaTier {
  const v = typeof document === 'undefined' ? null : document.documentElement.dataset.plasmaTier;
  return isTier(v) ? v : DEFAULT_TIER;
}
