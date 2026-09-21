import { useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CLAIMED_ATTR } from './PlasmaSurfaces';
import {
  FORMING_ATTR,
  PlasmaCanvas,
  PlasmaProvider,
  usePlasmaRuntime,
} from '@cruxgarden/plasma-ui';
import { plasmaGround } from './ground';
import { usePlasmaOn } from './usePlasmaOn';
import { useFlatChrome } from './useFlatChrome';
import { usePlasmaTier } from './usePlasmaTier';
import { PLASMA_TIERS } from './tiers';
import { usePlasmaOptics } from './usePlasmaOptics';
import { useLitLevel } from '@/hooks/useActivity';

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
export interface OverlaySurface {
  /** The element to draw the material under. */
  ref: RefObject<HTMLElement | null>;
  radius?: number;
  /** Fuse with the overlay's other surfaces (a menu growing out of its bar). */
  fuse?: boolean;
  /** Appear at once rather than form in (a bar the overlay is standing in for). */
  formIn?: boolean;
  elevation?: number | null;
  /**
   * Take this surface over from the ground while the overlay is up: the
   * ground stops drawing it (PlasmaSurfaces skips claimed elements) and the
   * overlay draws it instead, above everything the ground has.
   */
  claim?: boolean;
}

export default function PlasmaOverlay({
  surface,
  surfaces,
  radius = 14,
  zIndex = 1,
  canvasStyle,
  portal = false,
  always = false,
  overrides,
}: {
  /** The element to draw the material under; usually the dialog's panel. */
  surface?: RefObject<HTMLElement | null>;
  /** Or several, with their own options — a bar and the menu growing out of it. */
  surfaces?: OverlaySurface[];
  radius?: number;
  /** Where the canvas sits within the overlay's stacking context: above the scrim, below the panel. */
  zIndex?: number;
  canvasStyle?: React.CSSProperties;
  /**
   * Render the canvas at <body> instead of in place. A menu animated by a
   * transform (the dropdown motion role) or lifted on hover (a card) turns a
   * fixed canvas inside it into one the size of the menu, drawn in the wrong
   * place; at the body it covers the viewport as the renderer assumes. Give
   * it a z-index above the panes and below the menu's own (menus are z-50).
   */
  portal?: boolean;
  /** Draw even under flat chrome — the plasma button is material whatever the chrome. */
  always?: boolean;
  /** Live nudges to this overlay's material: the sheen, the halo, the rim (a multiplier) and the height. */
  overrides?: {
    shimmer?: number;
    shimmerSpeed?: number;
    glow?: number;
    rimScale?: number;
    elevation?: number;
  };
}) {
  const list: OverlaySurface[] = surfaces ?? (surface ? [{ ref: surface, radius }] : []);
  const first = list[0]?.ref;
  // Flat chrome (the Mood's plasmaChrome): a dialog or a menu is a plain
  // translucent plate, never material — there is nothing for this to draw.
  const flat = useFlatChrome();
  const on = usePlasmaOn() && (always || !flat);
  const tier = usePlasmaTier();
  const optics = usePlasmaOptics();
  const [ground, setGround] = useState<HTMLCanvasElement | null>(plasmaGround);
  useEffect(() => {
    if (!on) return;
    // The ground mounts with the Shell; a dialog can open a frame earlier.
    if (!ground) setGround(plasmaGround());
  }, [on, ground]);
  useEffect(() => {
    // Plasma off, or no ground yet: a panel pre-marked as forming must not wait.
    if (!on || !ground) first?.current?.removeAttribute(FORMING_ATTR);
  }, [on, ground, first]);
  const lit = useLitLevel();
  if (!on || !ground) return null;
  const t = PLASMA_TIERS[tier];
  return (
    <PlasmaProvider
      theme="dark"
      // The same material as the ground — the Mood's tint, frost, rim and
      // optics — so a dialog reads as one of the panes, only higher.
      mood={{ colors: optics.colors, blend: 20, spring: { stiffness: 170, damping: 16 } }}
      tint={optics.tint}
      opacity={optics.opacity}
      frost={Math.min(optics.frost, t.frost ?? 1)}
      // A dialog reads as one of the panes, so it warms with them: the same
      // lit rim (lib/moods/signals.ts), still scaled by whatever this overlay asked for.
      rim={(optics.rim + lit * optics.rimActivity) * (overrides?.rimScale ?? 1)}
      rimWidth={optics.rimWidth}
      rimColor={optics.rimColor}
      smoothness={optics.smoothness}
      edgeLine={optics.edgeLine}
      wash={optics.wash}
      formIn={optics.formIn}
      formSpeed={optics.formSpeed}
      formOut={optics.formOut}
      highlight={optics.pointerLight ? 1 : 0}
      refraction={optics.refraction}
      dispersion={optics.dispersion}
      ground="clear"
      background={ground}
      canvas={false}
      quality={Math.min(t.quality ?? 1.25, 1.25)}
      pointerDrop={false}
      pointerPull={optics.pointerPull}
      ambientDrops={false}
      flow={Math.min(optics.flow, t.flow ?? 3)}
      stretch={0}
      viscosity={optics.viscosity}
      grain={0}
      shimmer={overrides?.shimmer ?? 1}
      shimmerSpeed={overrides?.shimmerSpeed ?? 1}
      glow={overrides?.glow ?? 0}
      elevation={overrides?.elevation ?? Math.min(1, optics.elevation + 0.3)}
      blend={20}
      maxSurfaces={Math.max(2, list.length)}
    >
      {portal ? (
        createPortal(
          <PlasmaCanvas style={{ position: 'fixed', zIndex, ...canvasStyle }} />,
          document.body,
        )
      ) : (
        <PlasmaCanvas style={{ position: 'absolute', zIndex, ...canvasStyle }} />
      )}
      <OverlaySurfaces list={list} />
    </PlasmaProvider>
  );
}

function OverlaySurfaces({ list }: { list: OverlaySurface[] }) {
  const { renderer, supported } = usePlasmaRuntime();
  const key = list
    .map((s) => `${s.radius ?? ''}${s.fuse ? 'f' : ''}${s.claim ? 'c' : ''}`)
    .join('|');
  useEffect(() => {
    const els = list.map((s) => ({ s, el: s.ref.current })).filter((x) => x.el);
    if (!els.length) return;
    if (!renderer || !supported) {
      // No material here: whatever was marked as forming shows at once.
      if (!supported) for (const { el } of els) el!.removeAttribute(FORMING_ATTR);
      return;
    }
    // The dialog's CSS plate steps aside for the material (plasma.css keys
    // off this); it comes back if the material cannot draw here.
    const hosts = new Set<HTMLElement>();
    for (const { el } of els) {
      const host = el!.closest<HTMLElement>('[data-modal-open], [data-plasma-host]');
      if (host) hosts.add(host);
    }
    hosts.forEach((h) => h.setAttribute('data-plasma-overlay', ''));
    const handles = els.map(({ s, el }) => {
      if (s.claim) el!.setAttribute(CLAIMED_ATTR, '');
      return renderer.register(el!, {
        radius: s.radius ?? 14,
        lean: 0,
        fuse: !!s.fuse,
        elevation: s.elevation === undefined ? null : s.elevation,
        formIn: s.formIn === undefined ? null : s.formIn,
        // A copy standing in for a ground surface leaves at once — the
        // ground takes the element back the same frame.
        formOut: s.claim ? false : null,
      });
    });
    return () => {
      handles.forEach((h) => h.remove());
      for (const { s, el } of els) if (s.claim) el!.removeAttribute(CLAIMED_ATTR);
      hosts.forEach((h) => h.removeAttribute('data-plasma-overlay'));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, supported, key]);
  return null;
}
