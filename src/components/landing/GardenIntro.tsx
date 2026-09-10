import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { bundledMood } from '@/lib/moods/bundled-moods';
import { applyMood } from '@/lib/moods/packages';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { GARDEN_PLACES, GARDEN_WORLDS, type GardenPlaceId } from './worlds';

const GardenLandscape = lazy(() => import('./GardenLandscape'));

export default function GardenIntro({ initialMood }: { initialMood: string }) {
  const [worldId, setWorldId] = useState(initialMood);
  const [placeId, setPlaceId] = useState<GardenPlaceId>('site');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const changed = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (GARDEN_WORLDS.some((w) => w.id === id)) setWorldId(id);
    };
    window.addEventListener('public-mood-changed', changed);
    return () => window.removeEventListener('public-mood-changed', changed);
  }, []);
  const world = GARDEN_WORLDS.find((w) => w.id === worldId) ?? GARDEN_WORLDS[0]!;
  const place = GARDEN_PLACES.find((p) => p.id === placeId)!;
  async function visit(id: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const mood = bundledMood(id);
      if (mood) {
        await applyMood(mood);
        setSetting(SettingsKey.PublicMoodId, id);
        window.dispatchEvent(new CustomEvent('public-mood-changed', { detail: id }));
      }
      setWorldId(id);
    } catch {
      setError('That Mood could not load. You can still explore the garden.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="grow-intro"
      aria-labelledby="grow-title"
      style={{ '--world-sky': world.sky, '--world-accent': world.accent } as CSSProperties}
    >
      <div className="grow-hero-copy">
        <p className="grow-eyebrow">A CREATIVE WORKSPACE. A WORLD OF POSSIBILITIES.</p>
        <h1 id="grow-title">
          You can grow
          <br />
          <em>anything.</em>
        </h1>
        <p className="grow-description">
          A game. A world. A useful little tool.
          <br />
          An idea you can’t quite explain yet.
        </p>
        <p className="grow-invitation">Start with a conversation. See what grows.</p>
        <div className="grow-actions">
          <a className="grow-primary" href="#download">
            Start growing <span aria-hidden="true">↗</span>
          </a>
          <a className="grow-text-link" href="#places">
            Look around <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="grow-small">Build with AI. Keep your history. Share what you make.</p>
      </div>
      <div className={`grow-world ${world.night ? 'grow-world-night' : ''}`}>
        <div className="grow-world-caption">
          <span className="grow-world-dot" />
          <span>A LITTLE WORLD OF POSSIBILITIES</span>
          <span className="grow-world-number">
            {String(GARDEN_WORLDS.indexOf(world) + 1).padStart(2, '0')} / 08
          </span>
        </div>
        <ErrorBoundary
          fallback={
            <div className="garden-loading" role="status">
              Explore the places below.
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="garden-loading" role="status">
                Growing a little world…
              </div>
            }
          >
            <GardenLandscape world={world} onSelect={setPlaceId} />
          </Suspense>
        </ErrorBoundary>
        <div className="grow-world-bottom">
          <span>Drag to look around · choose a building</span>
          <span>{world.name}</span>
        </div>
      </div>
      <div className="grow-world-picker">
        <div>
          <p className="grow-eyebrow">WHAT DOES YOUR GARDEN FEEL LIKE?</p>
          <p className="grow-world-line" aria-live="polite">
            {world.line}
          </p>
        </div>
        <div className="grow-world-options" role="group" aria-label="Visit a garden world">
          {GARDEN_WORLDS.map((w) => (
            <button
              key={w.id}
              aria-pressed={w.id === world.id}
              disabled={busy}
              onClick={() => void visit(w.id)}
            >
              <span style={{ background: w.ground, borderColor: w.leaf }} />
              {w.name}
            </button>
          ))}
        </div>
        {world.study && <p className="grow-study">Landscape study · an idea for a future Mood.</p>}
        {error && <p role="status">{error}</p>}
      </div>
      <div className="grow-places" id="places">
        <div className="grow-place-picker">
          <p className="grow-eyebrow">THERE’S SOMETHING GROWING HERE</p>
          <div role="group" aria-label="Places in the garden">
            {GARDEN_PLACES.map((p, i) => (
              <button key={p.id} aria-pressed={p.id === placeId} onClick={() => setPlaceId(p.id)}>
                <span>0{i + 1}</span>
                {p.label}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grow-place-detail" aria-live="polite">
          <span className="grow-eyebrow">{place.kind}</span>
          <h2>{place.title}</h2>
          <p>{place.description}</p>
          <Link to={`/explore?q=${encodeURIComponent(place.query)}`}>
            {place.action} <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className="grow-manifesto">
        <p className="grow-eyebrow">WHAT IS CRUX GARDEN?</p>
        <p>
          A place to turn <em>“what if”</em>
          <br />
          into <em>“look at this.”</em>
        </p>
        <span>
          Build with AI, try different directions in parallel, and bring your ideas together.
          <br />
          Your creations keep their history. You decide what to share.
        </span>
      </div>
    </section>
  );
}
