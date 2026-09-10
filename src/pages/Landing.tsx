import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { ExploreCrux, ExploreTag } from '@/api/public';
import { Button } from '@/components/ui';
import GardenIntro from '@/components/landing/GardenIntro';
import { initialHomepageWorld } from '@/components/landing/worlds';
import '@/components/landing/garden-home.css';
import { useAudioStore } from '@/stores/audioStore';
import { useShallow } from 'zustand/react/shallow';
import { BUNDLED_MOODS, bundledMood } from '@/lib/moods/bundled-moods';
import { applyMood } from '@/lib/moods/packages';
import { setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import { APP_NAME } from '@/lib/constants';
import {
  GITHUB_APP_URL,
  GITHUB_ORG_URL,
  RELEASES_URL,
  CONTACT_EMAIL,
  fetchLatestDownload,
  type LatestDownload,
  type DownloadOption,
} from '@/lib/site';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { publicCoverUrl } from '@/lib/public-cover';

/**
 * crux.garden — the public website. Same app, VITE_PUBLIC_SITE=1: the pitch, the
 * download, Explore, the Mood (theme + sound) as a live demo, and the trust
 * statement (ADR 0008). Everything here works without an account.
 */
const InterpretationsPrototype = import.meta.env.DEV
  ? lazy(() => import('@/components/landing/InterpretationsPrototype'))
  : null;

export default function Landing() {
  const [params] = useSearchParams();
  if (
    InterpretationsPrototype &&
    ['warehouse', 'sunset', 'notebook'].includes(params.get('variant') ?? '')
  ) {
    return (
      <Suspense fallback={null}>
        <InterpretationsPrototype />
      </Suspense>
    );
  }
  return <LandingPage />;
}

function LandingPage() {
  const [initialWorld] = useState(initialHomepageWorld);
  const initialMood = bundledMood(initialWorld) ? initialWorld : 'the-keeper';
  useEffect(() => {
    document.title = `${APP_NAME} — You can grow anything`;
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  return (
    <div className="grow-home">
      <SiteHeader />
      <main>
        <GardenIntro initialMood={initialWorld} />
        <div className="grow-details">
          <ExploreSection />
          <HowItWorks />
          <MoodSection initialMood={initialMood} />
          <Hero />
          <Trust />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="grow-header">
      <Link to="/" className="grow-wordmark">
        {APP_NAME}
        <span aria-hidden="true">✳</span>
      </Link>
      <nav aria-label="Main navigation">
        <Link to="/explore">Explore</Link>
        <a href="#mood" className="grow-desktop-link">
          Moods
        </a>
        <Link to="/plans" className="grow-desktop-link">
          Plans
        </Link>
        <a href="#download" className="grow-header-download">
          Get Crux Garden ↗
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  const [download, setDownload] = useState<LatestDownload | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchLatestDownload().then((d) => !cancelled && setDownload(d));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <section id="download" className="grow-download">
      <p className="grow-eyebrow">A LITTLE ROOM FOR YOUR NEXT BIG IDEA</p>
      <h2>What will you grow?</h2>
      <p className="mt-5 text-sm text-text-muted max-w-xl mx-auto">
        Crux Garden is a creative workspace for your computer. Build with an AI collaborator, keep
        your work and its history, and publish when you’re ready.
      </p>
      <div className="mt-8 flex flex-col items-center gap-2">
        <DownloadButtons download={download} />
        <p className="mt-4 text-xs text-text-muted max-w-md">
          Free includes the whole app, the AI on your own key, and 1 GB published and backed up.
          Gardener adds room to grow and your own domain.{' '}
          <Link to="/plans" className="text-accent hover:underline">
            More room when you need it
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

const BUTTON =
  'inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius)] bg-accent text-bg font-display font-medium text-base hover:opacity-90';

function buttonLabel(o: Pick<DownloadOption, 'platform' | 'kind' | 'arch'>): string {
  if (o.platform === 'mac')
    return `Download for Mac (${o.arch === 'arm64' ? 'Apple silicon' : 'Intel'})`;
  if (o.platform === 'linux') return `Download for Linux (${o.kind})`;
  return 'Download for Windows';
}

/**
 * The download call to action. The visitor's OS picks the primary button:
 * Mac (per chip), Windows, or Linux (AppImage, .deb one click away). When the
 * OS or chip cannot be told — phones, Safari's hidden GPU — every build is
 * offered. Before the release exists the button goes to the releases page.
 */
function DownloadButtons({ download }: { download: LatestDownload | null | undefined }) {
  if (!download) {
    return (
      <>
        <a href={RELEASES_URL} className={BUTTON} data-testid="download-button">
          {download === undefined ? 'Download' : 'Releases on GitHub'}
        </a>
        <div className="text-xxs font-mono text-text-muted">
          macOS 13+, Windows 10+, Linux x64 · free · MIT licensed
        </div>
      </>
    );
  }
  const others = download.options.filter((o) => o.url !== download.url);
  const otherLine = (
    <>
      {others.map((o) => (
        <span key={o.url}>
          {' · '}
          <a href={o.url} className="hover:text-text underline">
            {o.platform === 'mac' ? `Mac (${o.label})` : o.label}
          </a>
        </span>
      ))}
      {' · '}
      <a href={RELEASES_URL} className="hover:text-text underline">
        all releases
      </a>
    </>
  );

  if (!download.detected) {
    // Nothing reliable about this visitor: one button per build, no favourite.
    return (
      <>
        <div className="flex flex-wrap justify-center gap-2">
          {download.options.map((o) => (
            <a
              key={o.url}
              href={o.url}
              className={BUTTON}
              data-testid={o.url === download.url ? 'download-button' : undefined}
            >
              {buttonLabel(o)}
            </a>
          ))}
        </div>
        <div className="text-xxs font-mono text-text-muted">
          v{download.version} · on a Mac, Apple menu → About This Mac shows which chip you have ·{' '}
          <a href={RELEASES_URL} className="hover:text-text underline">
            all releases
          </a>
        </div>
      </>
    );
  }

  return (
    <>
      <a href={download.url} className={BUTTON} data-testid="download-button">
        {buttonLabel(download)}
      </a>
      <div className="text-xxs font-mono text-text-muted">
        v{download.version}
        {download.size ? ` · ${formatBytes(download.size)}` : ''}
        {download.platform === 'linux' && download.kind === 'AppImage' ? ' · needs libfuse2' : ''}
        {otherLine}
      </div>
    </>
  );
}

function ExploreSection() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<ExploreCrux[]>([]);
  const [tags, setTags] = useState<ExploreTag[]>([]);
  useEffect(() => {
    let cancelled = false;
    publicApi
      .explore({ type: 'cruxes', sort: 'recent', perPage: 8 })
      .then((r) => !cancelled && setRecent(r.items as ExploreCrux[]))
      .catch(() => {});
    publicApi
      .exploreTags(16)
      .then((t) => !cancelled && setTags(t))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="explore" className="py-10 border-t border-border">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display text-2xl text-text">Explore what people made</h2>
        <Link to="/explore" className="text-xs font-mono text-text-muted hover:text-text">
          Browse everything →
        </Link>
      </div>
      <form
        className="relative mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
        }}
        role="search"
      >
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sites, zines, moods, authors… (@name, #tag)"
          aria-label="Search published cruxes"
          className="w-full px-4 py-3 text-sm bg-panel border border-border rounded-[var(--radius)] text-text placeholder:text-text-muted/60 focus:outline-none focus:border-input-border-active focus:ring-1 focus:ring-input-outline font-body"
        />
        <button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 text-xs font-mono rounded-[var(--radius-sm)] bg-surface text-text hover:bg-accent hover:text-bg cursor-pointer"
        >
          Search
        </button>
      </form>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {tags.map((t) => (
            <Link
              key={t.label}
              to={`/explore?tag=${encodeURIComponent(t.label)}`}
              className="px-2.5 py-1 text-xs font-mono rounded-chip bg-panel border border-border text-text-muted hover:text-text hover:border-text-muted"
            >
              #{t.label} <span className="opacity-50">{t.count}</span>
            </Link>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {recent.map((c) => (
            <Link
              key={c.id}
              to={`/${c.author_username}/${c.slug}`}
              className="block bg-panel border border-border rounded-card overflow-hidden hover:border-accent hover-lift"
            >
              <img
                src={publicCoverUrl(c.id)}
                alt=""
                loading="lazy"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                className="w-full aspect-[16/10] object-cover bg-garden-card-thumbnail"
              />
              <div className="p-3">
                <div className="font-display text-sm text-text truncate">{c.title || c.slug}</div>
                {c.description && (
                  <div className="text-xs text-text-muted line-clamp-2 mt-1">{c.description}</div>
                )}
                <div className="mt-2 text-2xs font-mono text-text-muted">@{c.author_username}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function MoodSection({ initialMood }: { initialMood: string }) {
  const [active, setActive] = useState<string | null>(initialMood);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { track, playing, toggle, init } = useAudioStore(
    useShallow((s) => ({
      track: s.track,
      playing: s.playing,
      toggle: s.toggle,
      init: s.init,
    })),
  );
  useEffect(() => init(), [init]);
  useEffect(() => {
    const changed = (event: Event) => setActive((event as CustomEvent<string>).detail);
    window.addEventListener('public-mood-changed', changed);
    return () => window.removeEventListener('public-mood-changed', changed);
  }, []);
  // Match the random opening world; landscape studies use The Keeper's Mood.
  useEffect(() => {
    const pkg = bundledMood(initialMood);
    if (pkg) void applyMood(pkg).catch(() => {});
  }, [initialMood]);

  const wear = async (id: string) => {
    const pkg = BUNDLED_MOODS.find((m) => m.id === id);
    if (!pkg || busy) return;
    setBusy(id);
    try {
      await applyMood(pkg);
      setSetting(SettingsKey.PublicMoodId, id);
      setActive(id);
      window.dispatchEvent(new CustomEvent('public-mood-changed', { detail: id }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="mood" className="py-10 border-t border-border">
      <h2 className="font-display text-2xl text-text mb-1">Set the mood</h2>
      <p className="text-sm text-text-muted mb-4">
        A Mood is a whole room: the look, the sound, and the voice you work with. Try one on this
        page — these Moods also ship in the app, and people publish their own.
      </p>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4" role="group" aria-label="Moods">
        {(showAll ? BUNDLED_MOODS : BUNDLED_MOODS.slice(0, 8)).map((pkg) => {
          const o = pkg.theme.overrides;
          return (
            <button
              key={pkg.id}
              type="button"
              aria-pressed={active === pkg.id}
              onClick={() => void wear(pkg.id)}
              disabled={!!busy}
              className={cn(
                'text-left rounded-card border overflow-hidden cursor-pointer hover-lift',
                active === pkg.id ? 'border-accent ring-2 ring-accent/40' : 'border-border',
              )}
              style={{ background: o.panel ?? o.bg, color: o.text }}
            >
              <div
                className="h-16"
                style={{
                  background: `linear-gradient(135deg, ${o.bg} 0%, ${o.surface ?? o.bg} 60%, ${o.accent} 100%)`,
                }}
              />
              <div className="p-2.5">
                <div className="text-sm font-display" style={{ color: o.heading ?? o.text }}>
                  {pkg.name}
                </div>
                <div className="text-2xs font-mono mt-0.5" style={{ color: o.textMuted ?? o.text }}>
                  {pkg.bundled?.track?.name ?? pkg.sound.track?.name ?? 'quiet'}
                  {pkg.persona ? ` · ${pkg.persona.name}` : ''}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-4 text-xs text-text-muted underline cursor-pointer"
        aria-expanded={showAll}
        onClick={() => setShowAll(!showAll)}
      >
        {showAll ? 'Show fewer Moods' : `See all ${BUNDLED_MOODS.length} Moods`}
      </button>
      <div className="mt-4 flex items-center gap-3 text-xs text-text-muted">
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={!track}
          className="px-3 py-1.5 rounded-button bg-accent text-bg font-medium cursor-pointer hover-bright disabled:opacity-50 disabled:cursor-default"
        >
          {playing ? 'Pause' : 'Play'} {track ? `“${track.name}”` : 'the track'}
        </button>
        <span>
          {track
            ? 'A Mood can bring its own soundtrack. Play it when you’re ready.'
            : 'This Mood is quiet. Wear The Keeper to hear the garden.'}
        </span>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Create',
      body: 'Start with an idea and an AI collaborator. Your Crux holds the conversation and what you make together, in a Project Folder you control.',
    },
    {
      title: 'Grow',
      body: 'Try different directions in independent Tasks. Review and merge what works; Growth preserves your snapshots, branches and the story of how you got here.',
    },
    {
      title: 'Publish',
      body: 'One click puts it live at its own address — or at your own domain with Gardener. Visitors can open “How was this made?” and read the conversation.',
    },
  ];
  return (
    <section className="py-10 border-t border-border">
      <h2 className="font-display text-2xl text-text mb-4">How it works</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="bg-panel border border-border rounded-[var(--radius)] p-4">
            <div className="text-2xs font-mono text-text-muted">0{i + 1}</div>
            <div className="font-display text-lg text-text mt-1">{s.title}</div>
            <p className="text-sm text-text-muted mt-1">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="py-10 border-t border-border">
      <h2 className="font-display text-2xl text-text mb-3">What the app sends</h2>
      <ul className="text-sm text-text-muted flex flex-col gap-1.5 max-w-2xl">
        <li>
          <span className="text-text">AI requests</span> go straight from your computer to the
          provider you chose, with your own key. Or run a local model and send nothing.
        </li>
        <li>
          <span className="text-text">Publishing and sync</span> send only what you ask to publish
          or back up, to crux.garden.
        </li>
        <li>
          <span className="text-text">Update checks</span> ask GitHub for the latest release. You
          can turn them off.
        </li>
        <li>
          <span className="text-text">Nothing else.</span> No analytics, no crash reporting unless
          you opt in, logs stay on your disk.
        </li>
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => window.open(GITHUB_APP_URL, '_blank')}>
          Read the source
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (window.location.href = `mailto:${CONTACT_EMAIL}`)}
        >
          {CONTACT_EMAIL}
        </Button>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border py-6 px-4 sm:px-6 text-xxs font-mono text-text-muted">
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <span>© {new Date().getFullYear()} Crux Garden · MIT</span>
        <span className="flex items-center gap-4">
          <Link to="/explore" className="hover:text-text">
            Explore
          </Link>
          <a href={GITHUB_ORG_URL} target="_blank" rel="noreferrer" className="hover:text-text">
            GitHub
          </a>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="hover:text-text">
            Releases
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-text">
            {CONTACT_EMAIL}
          </a>
        </span>
      </div>
    </footer>
  );
}
