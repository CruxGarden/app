import { useEffect, useState, type RefObject } from 'react';
import { FORMED_EVENT, FORMING_ATTR } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';

/**
 * Whether the plasma surface an element sits in has finished forming — so
 * heavy content (an app in an iframe, Monaco, a long conversation) can mount
 * after the material has arrived rather than compete with the animation for
 * the same frames (Daniel, 2026-09-19: the stutter as panes arrive).
 *
 * True at once when Plasma is off. Under Plasma it waits for the nearest
 * surface's `plasmaformed` (plasma-ui dispatches it on the element, bubbling),
 * with a fallback so a surface that never registers — too small, the
 * material unsupported — is never a pane that never shows.
 */
export function useSurfaceFormed(
  ref: RefObject<HTMLElement | null>,
  surface = '.mosaic.crux-mosaic-theme .mosaic-window',
  fallbackMs = 900,
): boolean {
  const on = usePlasmaOn();
  const [formed, setFormed] = useState(!on);
  useEffect(() => {
    // `<html data-plasma-wait="off">` mounts contents at once — the
    // performance suite's A/B, nothing a person sets.
    if (!on || document.documentElement.dataset.plasmaWait === 'off') {
      setFormed(true);
      return;
    }
    const el = ref.current?.closest<HTMLElement>(surface) ?? null;
    // Already formed (a pane re-rendering inside a settled surface), or no
    // surface to wait for.
    if (!el || (el.isConnected && !el.hasAttribute(FORMING_ATTR) && el.dataset.plasmaFormed))
      return void setFormed(true);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.dataset.plasmaFormed = '';
      setFormed(true);
    };
    const onFormed = (e: Event) => {
      if (e.target === el) finish();
    };
    el.addEventListener(FORMED_EVENT, onFormed);
    // Registration happens a frame after mount; if the mark never appears the
    // surface is not the material's (or has formed already) and there is
    // nothing to wait for.
    const t = setTimeout(finish, fallbackMs);
    const probe = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!el.hasAttribute(FORMING_ATTR)) finish();
      }),
    );
    return () => {
      el.removeEventListener(FORMED_EVENT, onFormed);
      clearTimeout(t);
      cancelAnimationFrame(probe);
    };
  }, [on, ref, surface, fallbackMs]);
  return formed;
}
