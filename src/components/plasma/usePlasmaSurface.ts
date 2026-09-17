import { useEffect, type RefObject } from 'react';
import { usePlasma } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';

/**
 * Make an element the app already renders into a plasma surface, rather than
 * wrapping it in <Plasma>. The panes, modals and cards here are laid out by
 * Mosaic, dialogs and grids that size themselves; registering the existing
 * node leaves all of that untouched and simply draws the material under it.
 *
 * Does nothing unless the Plasma theme is on, and unregisters cleanly when it
 * goes off or the element unmounts.
 */
export function usePlasmaSurface(
  ref: RefObject<HTMLElement | null>,
  options: { radius?: number; frost?: number; fuse?: boolean; lean?: number } = {},
) {
  const on = usePlasmaOn();
  const { renderer } = usePlasma();
  const { radius = 14, frost = 0.55, fuse = true, lean = 0 } = options;

  useEffect(() => {
    const el = ref.current;
    if (!on || !renderer || !el) return;
    const handle = renderer.register(el, { radius, lean, frost, fuse });
    return () => handle.remove();
  }, [on, renderer, ref, radius, frost, fuse, lean]);
}
