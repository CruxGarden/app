import type { ReactNode } from 'react';
import { PlasmaCanvas, PlasmaProvider } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';
import { usePlasmaTier } from './usePlasmaTier';
import { PLASMA_TIERS } from './tiers';
import { GROUND_CLASS } from './ground';
import { usePlasmaOptics } from './usePlasmaOptics';

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
export default function PlasmaStage({ children }: { children: ReactNode }) {
  const on = usePlasmaOn();
  const tier = usePlasmaTier();
  const optics = usePlasmaOptics();
  if (!on) return <>{children}</>;
  const t = PLASMA_TIERS[tier];
  return (
    <PlasmaProvider
      theme="dark"
      {...t}
      // The Mood's material: the field it paints, the tint and body of every
      // surface, the rim, how high they float — and the optics: refraction,
      // and dispersion, the chromatic aberration in the bend. Frost is the
      // Mood's too, capped by the tier (a weak GPU turns the blur chains off).
      mood={{ colors: optics.colors, blend: 20, spring: { stiffness: 170, damping: 16 } }}
      tint={optics.tint}
      opacity={optics.opacity}
      frost={Math.min(optics.frost, t.frost ?? 1)}
      rim={optics.rim}
      rimWidth={optics.rimWidth}
      elevation={optics.elevation}
      refraction={optics.refraction}
      dispersion={optics.dispersion}
      // Surfaces would fuse below blend/2 = 10px, and the Plasma Mood's
      // paneGap puts more than that between two tiles — but PlasmaSurfaces
      // registers every surface with fuse:false anyway, so panes keep their
      // own edges whatever the layout does. This is left short so that
      // anything which does opt into fusing has to be genuinely touching.
      blend={20}
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
