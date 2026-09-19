import { useEffect, useState, type ReactNode } from 'react';
import { PlasmaProvider } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';
import { usePlasmaTier } from './usePlasmaTier';
import { PLASMA_TIERS } from './tiers';

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
/** A numeric Mood token off <html>, live as the Mood changes. */
function readOptics() {
  const cs = getComputedStyle(document.documentElement);
  const num = (name: string, fallback: number) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : fallback;
  };
  return { refraction: num('--plasma-refraction', 1), dispersion: num('--plasma-dispersion', 1) };
}
function usePlasmaOptics() {
  const [optics, setOptics] = useState(readOptics);
  useEffect(() => {
    const update = () => setOptics(readOptics());
    update();
    document.addEventListener('palette-change', update);
    return () => document.removeEventListener('palette-change', update);
  }, []);
  return optics;
}

export default function PlasmaStage({ children }: { children: ReactNode }) {
  const on = usePlasmaOn();
  const tier = usePlasmaTier();
  const optics = usePlasmaOptics();
  if (!on) return <>{children}</>;
  return (
    <PlasmaProvider
      theme="dark"
      mood="tidal"
      {...PLASMA_TIERS[tier]}
      // The Mood's optics: refraction, and dispersion — the chromatic
      // aberration in the bend, the Mood's `plasmaDispersion` token.
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
      // Behind the app's content, above the page background.
      zIndex={-7}
    >
      {children}
    </PlasmaProvider>
  );
}
