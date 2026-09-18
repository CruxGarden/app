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
const FUSING = [
  '.mosaic.crux-mosaic-theme .mosaic-window',
  '.bg-panel',
  '.bg-dropdown',
  '.bg-model-selector-dropdown',
  '.bg-garden-card',
].join(',');

const FIXED = ['.bg-toolbar', '.bg-mood-bar'].join(',');

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
      return Number.isFinite(r) && r > 0 ? r : 14;
    };

    const sync = () => {
      const wanted = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(FUSING).forEach((el) => wanted.add(el));
      document.querySelectorAll<HTMLElement>(FIXED).forEach((el) => wanted.add(el));

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
            // frost and elevation are left to the provider, so one Mood
            // setting moves every surface together.
            fuse: FUSE_PANES && !el.matches(FIXED),
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
      records.some((r) =>
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
    const observer = new MutationObserver((records) => {
      if (touchesSurfaces(records)) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (queued) cancelAnimationFrame(queued);
      handles.forEach((h) => h.remove());
      handles.clear();
    };
  }, [on, renderer]);

  return null;
}
