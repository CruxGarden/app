import { useEffect } from 'react';
import { usePlasma } from '@cruxgarden/plasma-ui';
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
 * Chrome that must never bleed into a neighbour — the TopBar, the Mood bar —
 * registers with fuse:false, which is what those props are for.
 */
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
  const { renderer } = usePlasma();

  useEffect(() => {
    if (!on || !renderer) return;
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
            frost: 0.55,
            fuse: !el.matches(FIXED),
          }),
        );
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      handles.forEach((h) => h.remove());
      handles.clear();
    };
  }, [on, renderer]);

  return null;
}
