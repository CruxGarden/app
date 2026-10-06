/** Design specimen only. Rendered through Vite; never imported by the app. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { PlasmaProvider, Plasma } from '@cruxgarden/plasma-ui';
import { TeaserBrand } from '../../src/components/landing/TeaserMaterial';
import '../../src/components/landing/teaser.css';
import './banner.css';
const variant = new URLSearchParams(location.search).get('repo') || 'app';
const label = variant === 'api' ? 'API' : variant === 'cli' ? 'CLI' : 'App';
document.documentElement.dataset.repo = variant;
const colors: [string, string, string] =
  variant === 'api'
    ? ['#050b18', '#173f80', '#508edb']
    : variant === 'cli'
      ? ['#14070d', '#812c36', '#dc655f']
      : ['#050b12', '#0f5e46', '#3fbf8f'];
createRoot(document.getElementById('root')!).render(
  <div className="teaser">
    <PlasmaProvider
      theme="dark"
      formIn={false}
      preserveDrawingBuffer
      mood={{ colors, blend: 40, spring: { stiffness: 120, damping: 11 } }}
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
    >
      <div className="teaser-stage">
        <Plasma className="teaser-panel" radius={24} tint="#061016" opacity={0.55} frost={0.5}>
          <TeaserBrand />
          <span className="repo-label">{label}</span>
        </Plasma>
      </div>
    </PlasmaProvider>
  </div>,
);
