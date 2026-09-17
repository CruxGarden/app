import type { ReactNode } from 'react';
import { PlasmaProvider } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';

/**
 * The Plasma theme's material. One WebGL canvas behind the whole app, with
 * the settings the crux.garden teaser uses — the aurora field, an iridescent
 * rim, long stretch and flow, ambient drops — so the workspace and the
 * landing page are recognisably the same thing.
 *
 * It mounts only while the Plasma theme is on: the provider owns a canvas, a
 * render loop and a resize listener, and none of that should exist under
 * Glass or Custom. Surfaces attach themselves through usePlasmaSurface.
 */
export default function PlasmaStage({ children }: { children: ReactNode }) {
  const on = usePlasmaOn();
  if (!on) return <>{children}</>;
  return (
    <PlasmaProvider
      theme="dark"
      mood="aurora"
      tint="#ffffff"
      opacity={0}
      frost={0.25}
      rimColor="iridescent"
      rim={1.3}
      rimWidth={1.4}
      highlight={1}
      edgeLine={1}
      viscosity={0}
      stretch={2.5}
      flow={2}
      blend={56}
      refraction={1.4}
      dispersion={2.2}
      elevation={0.5}
      ambientDrops
      pointerDrop
      // The app shows far more surfaces at once than the teaser's one panel.
      // This is compiled into the shaders, so it is fixed for the mount.
      maxSurfaces={24}
      // Behind the app's content, above the page background.
      zIndex={-7}
    >
      {children}
    </PlasmaProvider>
  );
}
