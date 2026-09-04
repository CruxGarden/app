import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicApi } from '@/api';
import type { ExploreCrux, ExploreTag } from '@/api/public';
import { Button } from '@/components/ui';
import MoodBar from '@/components/mood/MoodBar';
import { useAudioStore } from '@/stores/audioStore';
import { useShallow } from 'zustand/react/shallow';
import { MOOD_PRESETS } from '@/lib/moods/presets';
import { activePresetId, applyActiveMood } from '@/lib/moods/active';
import { getResolvedMode } from '@/components/mood/mood-helpers';
import { setSetting } from '@/services/settings';
import { SettingsKey, APP_NAME } from '@/lib/constants';
import { ThemeMode } from '@/lib/types';
import {
  GITHUB_APP_URL,
  GITHUB_ORG_URL,
  RELEASES_URL,
  CONTACT_EMAIL,
  fetchLatestDownload,
  type LatestDownload,
} from '@/lib/site';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';

/**
 * crux.garden — the public website. Same app, VITE_PUBLIC_SITE=1: the pitch, the
 * download, Explore, the Mood (theme + sound) as a live demo, and the trust
 * statement (ADR 0008). Everything here works without an account.
 */
export default function Landing() {
  useEffect(() => {
    document.title = `${APP_NAME} — talk to an AI, make something, publish it`;
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col">
      <SiteHeader />
      {/* A quiet sheet over the animated background so type stays legible on any Mood */}
      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pb-24 mt-6 rounded-[var(--radius)] bg-bg/70 backdrop-blur-md border border-border/60">
        <Hero />
        <ExploreSection />
        <MoodSection />
        <HowItWorks />
        <Trust />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="relative z-20 flex items-center justify-between h-10 px-4 sm:px-6 border-b border-border bg-surface-solid/80 backdrop-blur-[var(--glass-blur)]">
      <Link to="/" className="font-wordmark text-lg text-text hover:text-accent">
        {APP_NAME}
      </Link>
      <nav className="flex items-center gap-4 text-[11px] font-mono text-text-muted">
        <MoodBar />
        <Link to="/explore" className="hover:text-text">
          Explore
        </Link>
        <a href="#mood" className="hover:text-text">
          Mood
        </a>
        <Link to="/plans" className="hover:text-text">
          Plans
        </Link>
        <a href="#download" className="hover:text-text">
          Download
        </a>
        <a href={GITHUB_ORG_URL} target="_blank" rel="noreferrer" className="hover:text-text">
          GitHub
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
  const other = download?.all.find((a) => a.arch !== download.arch);

  return (
    <section id="download" className="pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
      <h1 className="font-wordmark text-6xl sm:text-7xl font-semibold text-gateway-title leading-none">
        {APP_NAME}
      </h1>
      <p className="text-gateway-subtitle text-xl mt-2">where ideas grow</p>
      <p className="mt-6 text-base sm:text-lg text-text max-w-2xl mx-auto">
        Talk to an AI. Make something — a site, a zine, a photo feed, a soundscape. Publish it at
        your own address. Every version is kept, and visitors can see how it was made.
      </p>
      <p className="mt-2 text-sm text-text-muted max-w-2xl mx-auto">
        Local-first and open source. Your work lives in folders on your Mac; the AI runs on your own
        key. Publishing is the only part that touches our servers.
      </p>
      <div className="mt-8 flex flex-col items-center gap-2">
        {download ? (
          <>
            <a
              href={download.url}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius)] bg-accent text-bg font-display font-medium text-base hover:opacity-90"
              data-testid="download-button"
            >
              Download for Mac ({download.arch === 'arm64' ? 'Apple silicon' : 'Intel'})
            </a>
            <div className="text-[11px] font-mono text-text-muted">
              v{download.version}
              {download.size ? ` · ${formatBytes(download.size)}` : ''}
              {other && (
                <>
                  {' · '}
                  <a href={other.url} className="hover:text-text underline">
                    {other.arch === 'arm64' ? 'Apple silicon' : 'Intel'} build
                  </a>
                </>
              )}
              {' · '}
              <a href={RELEASES_URL} className="hover:text-text underline">
                all releases
              </a>
            </div>
          </>
        ) : (
          <>
            <a
              href={RELEASES_URL}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius)] bg-accent text-bg font-display font-medium text-base hover:opacity-90"
              data-testid="download-button"
            >
              {download === undefined ? 'Download for Mac' : 'Releases on GitHub'}
            </a>
            <div className="text-[11px] font-mono text-text-muted">
              macOS 13 or later · free · MIT licensed
            </div>
          </>
        )}
        <p className="mt-4 text-xs text-text-muted max-w-md">
          Free includes the whole app, the AI on your own key, 1 GB published and backed up, and a
          custom domain.{' '}
          <Link to="/plans" className="text-accent hover:underline">
            More room when you need it
          </Link>
          .
        </p>
      </div>
    </section>
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
              className="block bg-panel border border-border rounded-[var(--radius)] p-3 hover:border-accent"
            >
              <div className="font-display text-sm text-text truncate">{c.title || c.slug}</div>
              {c.description && (
                <div className="text-xs text-text-muted line-clamp-2 mt-1">{c.description}</div>
              )}
              <div className="mt-2 text-[10px] font-mono text-text-muted">@{c.author_username}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function MoodSection() {
  const section = getResolvedMode();
  const [active, setActive] = useState(() => activePresetId(section));
  const presets = MOOD_PRESETS.filter((p) => p.section === section).slice(0, 12);
  const { mixes, activeMixId, playing, toggle, selectMix, init } = useAudioStore(
    useShallow((s) => ({
      mixes: s.mixes,
      activeMixId: s.activeMixId,
      playing: s.playing,
      toggle: s.toggle,
      selectMix: s.selectMix,
      init: s.init,
    })),
  );
  useEffect(() => init(), [init]);

  const choose = (id: string) => {
    setSetting(section === 'Light' ? SettingsKey.MoodPresetLight : SettingsKey.MoodPresetDark, id);
    applyActiveMood(section);
    setActive(id);
  };
  const flipMode = () => {
    import('@/stores/themeStore').then(({ useThemeStore }) => {
      useThemeStore.getState().setMode(section === 'Light' ? ThemeMode.Dark : ThemeMode.Light);
      setActive(activePresetId(section === 'Light' ? 'Dark' : 'Light'));
    });
  };

  return (
    <section id="mood" className="py-10 border-t border-border">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-text">Set the mood</h2>
        <button
          type="button"
          onClick={flipMode}
          className="text-xs font-mono text-text-muted hover:text-text cursor-pointer"
        >
          Switch to {section === 'Light' ? 'dark' : 'light'}
        </button>
      </div>
      <p className="text-sm text-text-muted mb-4">
        A Mood is a look and a soundscape. Try one on this page — the same Moods ship in the app,
        and people publish their own.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-panel border border-border rounded-[var(--radius)] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-3">
            Theme
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2" role="listbox" aria-label="Themes">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={active === p.id}
                onClick={() => choose(p.id)}
                title={p.name}
                className={cn(
                  'aspect-square rounded-[var(--radius-sm)] border overflow-hidden cursor-pointer',
                  active === p.id ? 'border-accent ring-2 ring-accent/40' : 'border-border',
                )}
                style={{
                  background: `linear-gradient(135deg, ${p.overrides.bg ?? 'var(--bg)'} 50%, ${p.overrides.accent ?? 'var(--accent)'} 50%)`,
                }}
              >
                <span className="sr-only">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-2 text-[11px] font-mono text-text-muted">
            {presets.find((p) => p.id === active)?.name ?? active}
          </div>
        </div>
        <div className="bg-panel border border-border rounded-[var(--radius)] p-4">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted mb-3">
            Sound
          </div>
          <ul className="flex flex-col gap-1">
            {mixes.slice(0, 6).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => (m.id === activeMixId ? void toggle() : void selectMix(m.id))}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] text-sm cursor-pointer',
                    m.id === activeMixId
                      ? 'bg-surface text-text'
                      : 'text-text-muted hover:text-text',
                  )}
                  aria-pressed={m.id === activeMixId && playing}
                >
                  <span className="truncate">{m.name}</span>
                  <span className="text-[10px] font-mono">
                    {m.id === activeMixId && playing
                      ? 'playing'
                      : m.id === activeMixId
                        ? 'paused'
                        : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-[11px] text-text-muted">
            Generated live in your browser — nothing streams. The player sits in the top bar and
            follows you around the site.
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Create',
      body: 'Start from a template — a blog, a feed, a media page — and talk to the AI. Every crux is a real folder; open it in any editor.',
    },
    {
      title: 'Version',
      body: 'Growth keeps a snapshot after every AI turn. Branch, label, restore. Nothing is lost.',
    },
    {
      title: 'Publish',
      body: 'One click puts it live at your own address, with a custom domain if you like. Visitors can open “How was this made?” and read the conversation.',
    },
  ];
  return (
    <section className="py-10 border-t border-border">
      <h2 className="font-display text-2xl text-text mb-4">How it works</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="bg-panel border border-border rounded-[var(--radius)] p-4">
            <div className="text-[10px] font-mono text-text-muted">0{i + 1}</div>
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
          <span className="text-text">AI requests</span> go straight from your Mac to the provider
          you chose, with your own key. Or run a local model and send nothing.
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
    <footer className="relative z-10 border-t border-border py-6 px-4 sm:px-6 text-[11px] font-mono text-text-muted">
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
