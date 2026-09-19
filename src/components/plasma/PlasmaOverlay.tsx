import { useEffect, useState, type RefObject } from 'react';
import {
  FORMING_ATTR,
  PlasmaCanvas,
  PlasmaProvider,
  usePlasmaRuntime,
} from '@cruxgarden/plasma-ui';
import { plasmaGround } from './ground';
import { usePlasmaOn } from './usePlasmaOn';
import { usePlasmaTier } from './usePlasmaTier';
import { PLASMA_TIERS } from './tiers';

/**
 * The material above the scrim.
 *
 * The ground is one canvas behind everything, so a dialog — which sits above
 * the scrim — could never be drawn by it and painted a flat plate instead.
 * This is a second, clear-ground provider mounted inside the dialog's own
 * stacking context: its canvas sits between the scrim and the panel, draws
 * nothing but the panel's shape (with its shadow and rim), and refracts a
 * live sample of the ground canvas, so the dialog bends the field beneath
 * it the way every pane does. It is a full render pass while the dialog is
 * open and gone when it closes; a second dialog on top gets its own.
 *
 * The page content under the scrim is not in that sample — WebGL cannot read
 * the DOM — but the scrim has already dimmed it to the field.
 */
export default function PlasmaOverlay({
  surface,
  radius = 14,
  zIndex = 1,
}: {
  /** The element to draw the material under; usually the dialog's panel. */
  surface: RefObject<HTMLElement | null>;
  radius?: number;
  /** Where the canvas sits within the overlay's stacking context: above the scrim, below the panel. */
  zIndex?: number;
}) {
  const on = usePlasmaOn();
  const tier = usePlasmaTier();
  const [ground, setGround] = useState<HTMLCanvasElement | null>(plasmaGround);
  useEffect(() => {
    if (!on) return;
    // The ground mounts with the Shell; a dialog can open a frame earlier.
    if (!ground) setGround(plasmaGround());
  }, [on, ground]);
  useEffect(() => {
    // Plasma off, or no ground yet: a panel pre-marked as forming must not wait.
    if (!on || !ground) surface.current?.removeAttribute(FORMING_ATTR);
  }, [on, ground, surface]);
  if (!on || !ground) return null;
  const t = PLASMA_TIERS[tier];
  return (
    <PlasmaProvider
      theme="dark"
      mood="tidal"
      ground="clear"
      background={ground}
      canvas={false}
      quality={Math.min(t.quality ?? 1.25, 1.25)}
      frost={t.frost}
      pointerDrop={false}
      ambientDrops={false}
      flow={0}
      stretch={0}
      grain={0}
      glow={0}
      elevation={0.7}
      blend={20}
      maxSurfaces={2}
    >
      <PlasmaCanvas style={{ position: 'absolute', zIndex }} />
      <OverlaySurface surface={surface} radius={radius} />
    </PlasmaProvider>
  );
}

function OverlaySurface({
  surface,
  radius,
}: {
  surface: RefObject<HTMLElement | null>;
  radius: number;
}) {
  const { renderer, supported } = usePlasmaRuntime();
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    if (!renderer || !supported) {
      // No material here: whatever was marked as forming shows at once.
      if (!supported) el.removeAttribute(FORMING_ATTR);
      return;
    }
    // The dialog's CSS plate steps aside for the material (plasma.css keys
    // off this); it comes back if the material cannot draw here.
    const host = el.closest<HTMLElement>('[data-modal-open]');
    host?.setAttribute('data-plasma-overlay', '');
    const handle = renderer.register(el, { radius, lean: 0, fuse: false, elevation: 0.7 });
    return () => {
      handle.remove();
      host?.removeAttribute('data-plasma-overlay');
    };
  }, [renderer, supported, surface, radius]);
  return null;
}
