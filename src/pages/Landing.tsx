import { PlasmaProvider, Plasma } from '@cruxgarden/plasma-ui';
import gardenBackground from '@/assets/moods/digital-fractal-garden/garden.webp?url';
import { APP_NAME } from '@/lib/constants';
import '@/components/landing/teaser.css';

/**
 * crux.garden — the teaser. The Fractal Garden render behind one liquid glass
 * panel from @cruxgarden/plasma-ui, and nothing else. The previous site (pitch,
 * download, Explore, Mood demo) is in git history if it needs to come back.
 */
export default function Landing() {
  return (
    <div className="teaser">
      <PlasmaProvider theme="dark" background={gardenBackground} mood="aurora" tint="#5fd2a5">
        <main className="teaser-stage">
          <Plasma className="teaser-panel" radius={28}>
            <h1 className="teaser-title">{APP_NAME}</h1>
            <p className="teaser-line">Grow Anything</p>
          </Plasma>
        </main>
      </PlasmaProvider>
    </div>
  );
}
