import type { ReactNode } from 'react';
import { PlasmaProvider, Plasma } from '@cruxgarden/plasma-ui';
import { canRenderPlasma } from '@/lib/graphics';
import { APP_NAME } from '@/lib/constants';

/**
 * The field behind everything. Aurora's own palette ends on a violet accent,
 * which is what put a pink blob in the corner; this keeps its deep base and
 * runs the other two through green instead, so the page is one colour family.
 * Spring and blend are aurora's, unchanged.
 */
const FIELD = {
  colors: ['#050b12', '#0f5e46', '#3fbf8f'] as [string, string, string],
  blend: 40,
  spring: { stiffness: 120, damping: 11 },
};

/** The website and app entry share the same field, optics and motion. */
export function TeaserMaterial({ children }: { children: ReactNode }) {
  if (!canRenderPlasma()) return <>{children}</>;
  return (
    <PlasmaProvider
      theme="dark"
      mood={FIELD}
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
    >
      {children}
    </PlasmaProvider>
  );
}

export function TeaserPanel({
  children,
  draggable = false,
}: {
  children: ReactNode;
  draggable?: boolean;
}) {
  if (!canRenderPlasma())
    return <div className="teaser-panel teaser-panel-fallback">{children}</div>;
  return (
    <Plasma
      className="teaser-panel"
      radius={24}
      tint="#061016"
      opacity={0.55}
      frost={0.5}
      draggable={draggable}
    >
      {children}
    </Plasma>
  );
}

export function TeaserBrand() {
  return (
    <>
      <h1 className="teaser-title">{APP_NAME}</h1>
      <p className="teaser-line">grow anything</p>
    </>
  );
}
