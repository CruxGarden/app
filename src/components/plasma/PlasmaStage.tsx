import { useEffect, useState, type ReactNode } from 'react';
import { PlasmaCanvas, PlasmaProvider } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';
import { usePlasmaTier } from './usePlasmaTier';
import { PLASMA_TIERS } from './tiers';
import { GROUND_CLASS } from './ground';
import { usePlasmaOptics } from './usePlasmaOptics';
import { useLitLevel } from '@/hooks/useActivity';

/**
 * The Plasma theme's material: one WebGL canvas behind the whole app.
 *
 * The look is the workspace example's — mood, frost, a short blend, and the
 * library's own defaults for everything else. That example is what this theme
 * is aiming at: panels that read as clean glass tiles. The teaser's settings
 * (viscosity 0, stretch 2.5, flow 2, dispersion 2.2, ambient drops) are the
 * far end of the same dials and belong behind a hero, not under a text editor.
 *
 * Everything that costs real GPU time comes from the tier (see tiers.ts), so
 * a machine that cannot hold a frame at `high` has somewhere to go that is not
 * "off". Off is a different control: the surface style falls back to Glass.
 *
 * It mounts only while the Plasma theme is on: the provider owns a canvas, a
 * render loop and a resize listener, and none of that should exist under
 * Glass or Custom. Surfaces attach themselves through PlasmaSurfaces.
 */
/**
 * The workspace packs panes twelve pixels apart. The teaser's ripple (flow
 * 2) is wider than that gap, so wobbling edges collide and leave lens-shaped
 * holes between the bars and the panes. Inside the builder the ripple is
 * held to a few pixels and the trailing to a little; the Home Garden, the
 * Mood page and the rest keep the Mood's full water.
 */
const WORKSPACE_FLOW = 0.45;
const WORKSPACE_STRETCH = 1.4;
/** `<html data-workspace>` while a builder is mounted (WorkspaceLayout sets it). The stage sits outside the router. */
export const WORKSPACE_ATTR = 'data-workspace';
function useInWorkspace(): boolean {
  const read = () => document.documentElement.hasAttribute(WORKSPACE_ATTR);
  const [inWorkspace, setInWorkspace] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setInWorkspace(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [WORKSPACE_ATTR] });
    return () => obs.disconnect();
  }, []);
  return inWorkspace;
}

/** `<html data-plasma-chrome="flat">` while the Mood keeps the chrome — bar, menus, dialogs — out of the material. */
export const CHROME_ATTR = 'data-plasma-chrome';

export default function PlasmaStage({ children }: { children: ReactNode }) {
  const on = usePlasmaOn();
  const tier = usePlasmaTier();
  const optics = usePlasmaOptics();
  const inWorkspace = useInWorkspace();
  // The last stage of the garden warming up (lib/moods/signals.ts): below
  // LIT_FROM only the colour comes back, and past it the iridescence climbs
  // toward the landing page's rim. Quantised, so this is a few dozen renders
  // across a fade, and the renderer takes them through configure().
  const lit = useLitLevel();
  // The stylesheets, the ground and the overlays key off the same attribute.
  useEffect(() => {
    const html = document.documentElement;
    if (on && optics.flatChrome) html.setAttribute(CHROME_ATTR, 'flat');
    else html.removeAttribute(CHROME_ATTR);
  }, [on, optics.flatChrome]);
  if (!on) return <>{children}</>;
  const t = PLASMA_TIERS[tier];
  const flowCap = Math.min(t.flow ?? 3, inWorkspace ? WORKSPACE_FLOW : 3);
  const stretchCap = Math.min(t.stretch ?? 3, inWorkspace ? WORKSPACE_STRETCH : 3);
  return (
    <PlasmaProvider
      theme="dark"
      {...t}
      // The Mood's material: the field it paints, the tint and body of every
      // surface, the rim, how high they float — and the optics: refraction,
      // and dispersion, the chromatic aberration in the bend. Frost is the
      // Mood's too, capped by the tier (a weak GPU turns the blur chains off).
      mood={{ colors: optics.colors, blend: optics.blend, spring: { stiffness: 170, damping: 16 } }}
      // A Mood may ask for a still ground of one colour instead of the field.
      {...(optics.background ? { background: optics.background } : {})}
      tint={optics.tint}
      opacity={optics.opacity}
      frost={Math.min(optics.frost, t.frost ?? 1)}
      rim={optics.rim + lit * optics.rimActivity}
      rimWidth={optics.rimWidth}
      rimColor={optics.rimColor}
      smoothness={optics.smoothness}
      edgeLine={optics.edgeLine}
      wash={optics.wash}
      formIn={optics.formIn}
      formSpeed={optics.formSpeed}
      formOut={optics.formOut}
      // The pointer: the bead that follows it (the tier may still say no on a
      // weak GPU), and the light the edges throw toward it.
      pointerDrop={optics.pointerDrop && t.pointerDrop !== false}
      // The liquid: the Mood's, within what the tier can afford.
      flow={Math.min(optics.flow, flowCap)}
      stretch={Math.min(optics.stretch, stretchCap)}
      viscosity={optics.viscosity}
      ambientDrops={optics.ambientDrops && t.ambientDrops !== false}
      pointerPull={optics.pointerPull}
      highlight={optics.pointerLight ? 1 : 0}
      elevation={optics.elevation}
      shimmer={optics.shimmer}
      glow={optics.glow}
      grain={optics.grain}
      refraction={optics.refraction}
      dispersion={optics.dispersion}
      // Surfaces would fuse below blend/2, and the Plasma Mood's paneGap
      // puts more than that between two tiles — PlasmaSurfaces registers
      // every surface with fuse:false anyway, so panes keep their own edges
      // whatever the layout does. The Mood's token (Soft Black's thin
      // gutters ask for a small one, or three panes read as one slab).
      blend={optics.blend}
      grid={24}
      // The app shows far more surfaces at once than the teaser's one panel.
      // Changing this recompiles the shaders, so it is set once, here.
      maxSurfaces={24}
      // The overlays (PlasmaOverlay: a dialog above the scrim) sample this
      // canvas as their background, so its frames are kept after they show.
      preserveDrawingBuffer
      canvas={false}
    >
      {/* Behind the app's content, above the page background. */}
      <PlasmaCanvas zIndex={-7} className={GROUND_CLASS} />
      {children}
    </PlasmaProvider>
  );
}
