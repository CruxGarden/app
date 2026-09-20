import { useEffect } from 'react';
import { usePlasmaRuntime } from '@cruxgarden/plasma-ui';
import type { ShapeHandle } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';

/**
 * Attaches the app's primary surfaces to the shared material.
 *
 * These are the same surfaces styles/glass.css frosts — the panes, panels,
 * dropdowns and garden cards — and they are found by selector rather than by
 * editing each component, because they are rendered from a dozen places and
 * several of them (Mosaic windows, portalled dialogs) are not ours to wrap.
 * A MutationObserver keeps up as panes open and close.
 *
 * Every surface registers with fuse:false: each one is its own drop, with its
 * own rim and its own corners, and two panes side by side never run together.
 * Fusing is the library's signature, but it is a layout claim as much as a
 * look — a pane that melts into its neighbour when a splitter moves is a pane
 * whose edges the design can no longer rely on. Flip FUSE_PANES to watch them
 * behave like one sheet instead.
 */
const FUSE_PANES = false;
const FUSING = ['.mosaic.crux-mosaic-theme .mosaic-window', '.bg-panel', '.bg-garden-card'].join(
  ',',
);

const FIXED = ['.bg-toolbar', '.bg-public-top-bar', '.bg-mood-bar'].join(',');
/** Set by PlasmaOverlay on a ground surface it has taken over. */
export const CLAIMED_ATTR = 'data-plasma-claimed';

/**
 * A surface is a container, not a control. The panel classes are shared with
 * inputs and selects — Tending styles its search box `bg-panel` — and a text
 * field that fuses with its neighbour and refracts the wallpaper is not a text
 * field any more. Anything that takes typing or clicking keeps its flat paint.
 */
const CONTROLS = new Set(['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'OPTION', 'LABEL', 'A']);
/**
 * And a surface is something you can see. Below this the material reads as
 * noise, and every one of them spends a slot out of maxSurfaces that a real
 * panel wanted.
 */
const MIN_SIDE = 96;

function isSurface(el: HTMLElement) {
  if (CONTROLS.has(el.tagName)) return false;
  // Claimed by an overlay (a menu growing out of the top bar draws the bar on
  // its own canvas meanwhile): the ground leaves it alone until it is back.
  if (el.hasAttribute(CLAIMED_ATTR)) return false;
  // A dialog lives above the scrim, where the canvas cannot reach; it paints
  // its own plate (plasma.css) and must not register, or the material draws
  // its shape under the scrim and squares off the corners of whatever it
  // overlaps.
  if (el.closest('[data-modal-open]')) return false;
  const r = el.getBoundingClientRect();
  return r.width >= MIN_SIDE && r.height >= MIN_SIDE / 2;
}

export default function PlasmaSurfaces() {
  const on = usePlasmaOn();
  // The runtime half of the context: stable, so a Mood changing a colour does
  // not re-run any of this.
  const { renderer } = usePlasmaRuntime();

  useEffect(() => {
    if (!on || !renderer) return;
    // A handle on the material for the performance suite, which pushes quality
    // past every tier to find where this machine actually breaks. Dev only —
    // it is dropped from a production build with the branch.
    if (import.meta.env.DEV)
      (window as unknown as { __plasmaRenderer?: unknown }).__plasmaRenderer = renderer;
    const handles = new Map<HTMLElement, ShapeHandle>();

    const radiusOf = (el: HTMLElement) => {
      const r = parseFloat(getComputedStyle(el).borderTopLeftRadius);
      // 0 is a corner too (Daniel: hard edges when the radius is 0).
      return Number.isFinite(r) && r >= 0 ? r : 14;
    };

    const sync = () => {
      const wanted = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(FUSING).forEach((el) => {
        if (isSurface(el)) wanted.add(el);
      });
      // Flat chrome (the Mood's plasmaChrome): the docks are not surfaces.
      if (document.documentElement.getAttribute('data-plasma-chrome') !== 'flat')
        document.querySelectorAll<HTMLElement>(FIXED).forEach((el) => {
          if (isSurface(el)) wanted.add(el);
        });

      for (const [el, handle] of handles) {
        if (!wanted.has(el) || !el.isConnected) {
          handle.remove();
          handles.delete(el);
        }
      }
      wanted.forEach((el) => {
        if (handles.has(el)) return;
        handles.set(
          el,
          renderer.register(el, {
            radius: radiusOf(el),
            lean: 0,
            // frost is left to the provider, so one Mood setting moves every
            // surface together. Chrome sits above the workspace rather than in
            // it, and reads as a dock rather than a pane, so it floats higher.
            elevation: el.matches(FIXED) ? 0.5 : null,
            fuse: FUSE_PANES && !el.matches(FIXED),
            // A dock handed to an overlay must not shrink away on the ground
            // while the overlay's copy stands in for it: it leaves at once.
            formOut: el.matches(FIXED) ? false : null,
          }),
        );
      });
    };

    // Two full-document queries per mutation is not survivable in this app: a
    // streaming reply and a keystroke in Monaco both mutate the DOM dozens of
    // times a second, and none of those mutations open or close a pane. The
    // work is coalesced into one frame, and mutations that cannot have
    // changed the surface set are dropped before it is even scheduled.
    let queued = 0;
    const schedule = () => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        sync();
      });
    };

    const touchesSurfaces = (records: MutationRecord[]) =>
      records.some(
        (r) =>
          r.type === 'attributes' ||
          [...r.addedNodes, ...r.removedNodes].some(
            (n) =>
              n.nodeType === Node.ELEMENT_NODE &&
              ((n as Element).matches(FUSING) ||
                (n as Element).matches(FIXED) ||
                !!(n as Element).querySelector(FUSING) ||
                !!(n as Element).querySelector(FIXED)),
          ),
      );

    sync();
    // A Mood change moves the corner radius (Office asks for 0 where Plasma
    // had 16); the surfaces already registered take the new one.
    const recorner = () => {
      for (const [el, handle] of handles) handle.update({ radius: radiusOf(el) });
    };
    document.addEventListener('palette-change', recorner);
    const observer = new MutationObserver((records) => {
      if (touchesSurfaces(records)) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [CLAIMED_ATTR],
    });
    return () => {
      document.removeEventListener('palette-change', recorner);
      observer.disconnect();
      if (queued) cancelAnimationFrame(queued);
      handles.forEach((h) => h.remove());
      handles.clear();
    };
  }, [on, renderer]);

  return null;
}
