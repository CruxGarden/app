import type { ReactNode } from 'react';
import { PlasmaProvider } from '@cruxgarden/plasma-ui';
import { usePlasmaOn } from './usePlasmaOn';

/**
 * The Plasma theme's material: one WebGL canvas behind the whole app.
 *
 * The settings are the workspace example's, near enough — mood, frost, a
 * short blend and the library's own defaults for everything else. That
 * example is the look this theme is aiming at: panels that read as clean
 * glass tiles and only fuse when they are actually pushed together. The
 * teaser's settings (viscosity 0, stretch 2.5, flow 2, dispersion 2.2,
 * ambient drops) are the opposite end of the same dials and belong on a
 * landing page, not under a text editor.
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
      mood="tidal"
      frost={0.35}
      // Surfaces fuse below blend/2 = 10px. --pane-gap under Plasma puts 14px
      // between two tiles, so panes stay distinct until something moves them
      // together — the workspace example's behaviour, and the reason the gap
      // and this number have to be read as one setting.
      blend={20}
      grid={24}
      // Quieter than the defaults, because this sits under Monaco and a
      // streaming conversation rather than behind a hero.
      flow={0}
      ambientDrops={false}
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
