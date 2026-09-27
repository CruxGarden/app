import { publishBaseUrlFor, hasRemotePublishOrigin } from '@/lib/public-url';
import { Avatar, Panel, Button, SectionLabel, Spinner } from '@/components/ui';
import { SearchIcon, CloseIcon } from '@/components/ui/icons';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi, apiBaseUrl } from '@/api';
import type {
  ExploreCrux,
  ExploreAuthor,
  ExploreTag,
  ExploreParams,
  ExploreSort,
} from '@/api/public';
import { parseExploreParams, type ExploreView } from './explore-params';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import MoodResultCard from '@/components/explore/MoodResultCard';
import ToolResultCard from '@/components/explore/ToolResultCard';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { publicCoverUrl } from '@/lib/public-cover';
import { APP_NAME } from '@/lib/constants';
import PageHeader from '@/components/layout/PageHeader';

/**
 * Explore — where a person finds the four things other people share: Cruxes,
 * people, Crux Tools and Moods. Tags are the way in: they sit under the search
 * on arrival, one click filters, and every card carries its own. The website's
 * /explore is this same component with its filters in the URL.
 */
const VIEWS: { id: ExploreView; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'cruxes', label: 'Cruxes' },
  { id: 'people', label: 'People' },
  { id: 'tools', label: 'Tools' },
  { id: 'moods', label: 'Moods' },
];
/** The kinds a Crux can be, under the Cruxes tab (Tools and Moods have their own). */
const KINDS: { id: string; label: string }[] = [
  { id: '', label: 'Everything' },
  { id: 'webapp', label: 'Sites' },
  { id: 'page', label: 'Pages' },
  { id: 'notes', label: 'Notes' },
  { id: 'document', label: 'Documents' },
  { id: 'image', label: 'Images' },
];
const KIND_LABEL: Record<string, string> = {
  webapp: 'Site',
  page: 'Page',
  notes: 'Notes',
  document: 'Document',
  image: 'Image',
  mood: 'Mood',
  tool: 'Tool',
};
const SORTS: { id: ExploreSort; label: string }[] = [
  { id: 'relevant', label: 'Best match' },
  { id: 'recent', label: 'Recent' },
  { id: 'newest', label: 'Newest' },
  { id: 'alpha', label: 'A-Z' },
];
const TAGS_SHOWN = 18;

/** A listed author's picture: the API's URL, or a data URL it stored. */
function resolveAvatarUrl(meta?: Record<string, unknown>): string | null {
  const url = meta?.avatarUrl || meta?.avatar_url;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;
  return `${apiBaseUrl()}${url}`;
}

/** The published site's cover (shipped as _crux/cover.jpg); hidden when the publish predates covers. */
function CoverThumb({ cruxId }: { cruxId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={publicCoverUrl(cruxId)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-16 h-10 rounded-card object-cover shrink-0 bg-garden-card-thumbnail border border-garden-card-border"
    />
  );
}

/** One tag as a chip: quiet when available, filled when it is filtering. */
function TagChip({
  label,
  count,
  active,
  onClick,
  size = 'sm',
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
  size?: 'xs' | 'sm';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-chip border cursor-pointer transition-colors font-mono',
        size === 'xs' ? 'px-1.5 py-0.5 text-3xs' : 'px-2.5 py-1 text-xs',
        active
          ? 'bg-accent text-bg border-accent'
          : 'bg-surface/50 text-text-muted border-border hover:text-text hover:border-text-muted',
      )}
    >
      #{label}
      {count !== undefined && <span className="ml-1 opacity-50">{count}</span>}
    </button>
  );
}

/* ── Explore (the pane and the public page) ─────────────── */

/** The filter state Explore exposes — the public page mirrors it into the URL. */
export interface ExploreState {
  q: string;
  type: ExploreView;
  sort: ExploreSort;
  kind: string;
  tags: string[];
  author: string;
  page: number;
}

const isCrux = (r: ExploreCrux | ExploreAuthor): r is ExploreCrux => 'slug' in r;

export default function Explore({
  initial,
  onStateChange,
}: {
  initial?: Partial<ExploreState>;
  onStateChange?: (state: ExploreState) => void;
}) {
  const navigate = useNavigate();

  const [q, setQ] = useState(initial?.q ?? '');
  const [view, setView] = useState<ExploreView>(() => {
    if (initial?.type) return initial.type;
    // The opener asked for a kind (Install from Explore → tools; a Mood link → moods).
    const asked = useUIStore.getState().exploreKind;
    return asked === 'tool' ? 'tools' : asked === 'mood' ? 'moods' : 'all';
  });
  const [sort, setSort] = useState<ExploreSort>(
    initial?.sort ?? (initial?.q ? 'relevant' : 'recent'),
  );
  const [author, setAuthor] = useState(initial?.author ?? '');
  // Inside the app (services ready) results can be installed / opened locally
  const appReady = useAppStore((s) => s.ready);
  const [kind, setKind] = useState<string>(() => {
    const asked = initial?.kind ?? useUIStore.getState().exploreKind ?? '';
    return asked === 'tool' || asked === 'mood' ? '' : asked;
  });
  useEffect(() => {
    if (useUIStore.getState().exploreKind) useUIStore.setState({ exploreKind: null });
  }, []);
  const [activeTags, setActiveTags] = useState<string[]>(initial?.tags ?? []);
  const [page, setPage] = useState(initial?.page ?? 1);
  const [allTags, setAllTags] = useState(false);

  // Mirror state outward (the public page writes it to the URL so searches are links)
  useEffect(() => {
    onStateChange?.({ q, type: view, sort, kind, tags: activeTags, author, page });
  }, [q, view, sort, kind, activeTags, author, page, onStateChange]);

  const [cruxes, setCruxes] = useState<ExploreCrux[]>([]);
  const [people, setPeople] = useState<ExploreAuthor[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [tags, setTags] = useState<ExploreTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  // An API that could not be reached is not an empty catalogue.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The tags people use, for the view in front (a Mood's tags are not a site's).
  const tagKind = view === 'tools' ? 'tool' : view === 'moods' ? 'mood' : kind || undefined;
  useEffect(() => {
    publicApi
      .exploreTags(60, tagKind)
      .then(setTags)
      .catch(() => setTags([]));
  }, [tagKind]);

  // Fetch results: one request per view; All asks for Cruxes and, when there
  // is something to match, people too.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const base: ExploreParams = { sort, page, perPage: view === 'all' ? 12 : 24 };
    if (q) base.q = q;
    if (author) base.author = author;
    if (activeTags.length > 0) base.tag = activeTags;
    const cruxParams: ExploreParams = { ...base, type: 'cruxes' };
    if (view === 'cruxes' && kind) cruxParams.kind = kind;
    if (view === 'tools') cruxParams.kind = 'tool';
    if (view === 'moods') cruxParams.kind = 'mood';
    const wantCruxes = view !== 'people';
    const wantPeople = view === 'people' || (view === 'all' && !!q);
    let unreachable = false;
    const none = { items: [], totalPages: 1 };
    const failedAs = () => {
      unreachable = true;
      return none;
    };
    Promise.all([
      wantCruxes ? publicApi.explore(cruxParams).catch(failedAs) : Promise.resolve(none),
      wantPeople
        ? publicApi
            .explore({ ...base, type: 'authors', perPage: view === 'all' ? 4 : 24 })
            .catch(failedAs)
        : Promise.resolve(none),
    ]).then(([c, p]) => {
      if (cancelled) return;
      const cruxItems = c.items as (ExploreCrux | ExploreAuthor)[];
      const peopleItems = p.items as (ExploreCrux | ExploreAuthor)[];
      setCruxes(cruxItems.filter(isCrux));
      setPeople(peopleItems.filter((r): r is ExploreAuthor => !isCrux(r)));
      setTotalPages(view === 'people' ? p.totalPages : c.totalPages);
      setFailed(unreachable);
      setLoading(false);
      setLoadedOnce(true);
    });
    return () => {
      cancelled = true;
    };
  }, [q, view, sort, activeTags, kind, author, page, attempt]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(value);
      // a fresh term ranks by relevance; clearing it falls back to recency
      setSort((prev) =>
        value ? (prev === 'recent' ? 'relevant' : prev) : prev === 'relevant' ? 'recent' : prev,
      );
      setPage(1);
    }, 300);
  }, []);

  const handleClear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    setQ('');
    setSort((prev) => (prev === 'relevant' ? 'recent' : prev));
    setPage(1);
  }, []);

  const filterByAuthor = useCallback((username: string) => {
    setAuthor(username);
    setView((v) => (v === 'people' ? 'all' : v));
    setPage(1);
  }, []);

  const toggleTag = useCallback((label: string) => {
    setActiveTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label],
    );
    setPage(1);
  }, []);

  const changeView = useCallback((next: ExploreView) => {
    setView(next);
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    setQ('');
    setActiveTags([]);
    setAuthor('');
    setSort('recent');
    setKind('');
    setPage(1);
  }, []);

  const handleNavigate = useCallback((path: string) => navigate(path), [navigate]);

  const hasFilters =
    q ||
    activeTags.length > 0 ||
    author ||
    (sort !== 'recent' && sort !== 'relevant') ||
    kind !== '';

  // The All view splits what came back by what it is.
  const byKind = useMemo(
    () => ({
      moods: cruxes.filter((c) => c.kind === 'mood'),
      tools: cruxes.filter((c) => c.kind === 'tool'),
      rest: cruxes.filter((c) => c.kind !== 'mood' && c.kind !== 'tool'),
    }),
    [cruxes],
  );
  const shownTags = allTags ? tags : tags.slice(0, TAGS_SHOWN);
  const empty =
    view === 'people' ? people.length === 0 : cruxes.length === 0 && people.length === 0;

  const CruxCard = ({ crux }: { crux: ExploreCrux }) => {
    const href = `/${crux.author_username}/${crux.slug}`;
    const avatarUrl = resolveAvatarUrl(crux.author_meta);
    // A div, not a <button>: the tag and author chips inside are real buttons,
    // and a button inside a button is invalid HTML with unreliable click routing.
    return (
      <div
        role="link"
        tabIndex={0}
        aria-label={crux.title || crux.slug}
        onClick={() => handleNavigate(href)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleNavigate(href);
        }}
        className="w-full px-4 py-3 text-left hover:bg-accent-muted/30 cursor-pointer group flex items-start gap-3 border-b border-border last:border-b-0 motion-enter-card"
      >
        {/* The cover needs room; a narrow pane shows the person's face alone. */}
        <div className="hidden @md:block">
          <CoverThumb cruxId={crux.id} />
        </div>
        <Avatar
          url={avatarUrl}
          className="ring-1 ring-text-muted/20 mt-0.5"
          fallbackClassName="bg-surface"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-display text-sm font-medium text-text group-hover:text-accent truncate">
              {crux.title}
            </div>
            {crux.kind && KIND_LABEL[crux.kind] && (
              <span className="text-3xs font-mono px-1.5 py-0.5 rounded-chip bg-badge text-badge-text border border-badge-border shrink-0">
                {KIND_LABEL[crux.kind]}
              </span>
            )}
          </div>
          {crux.description && (
            <p className="text-xs text-text-muted truncate">{crux.description}</p>
          )}
          {crux.tags && crux.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {crux.tags.slice(0, 6).map((t) => (
                <span key={t} onClick={(e) => e.stopPropagation()}>
                  <TagChip
                    label={t}
                    size="xs"
                    active={activeTags.includes(t)}
                    onClick={() => toggleTag(t)}
                  />
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-2xs font-mono text-text-muted">
            <button
              type="button"
              aria-label={`Only cruxes by ${crux.author_username}`}
              onClick={(e) => {
                e.stopPropagation();
                filterByAuthor(crux.author_username);
              }}
              className="hover:text-accent cursor-pointer"
            >
              @{crux.author_username}
            </button>
            <span aria-hidden>·</span>
            <span>{formatDate(crux.created)}</span>
          </div>
        </div>
      </div>
    );
  };

  const AuthorCard = ({ author }: { author: ExploreAuthor }) => {
    const avatarUrl = resolveAvatarUrl(author.meta);
    return (
      <button
        onClick={() => handleNavigate(`/${author.username}`)}
        className="w-full px-4 py-3 text-left hover:bg-accent-muted/30 cursor-pointer group flex items-center gap-3 border-b border-border last:border-b-0 motion-enter-card"
      >
        <Avatar
          url={avatarUrl}
          size="md"
          className="ring-1 ring-text-muted/20"
          fallbackClassName="bg-surface"
        />
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm font-medium text-text group-hover:text-accent truncate">
            {author.display_name || author.username}
          </div>
          <div className="text-xs font-mono text-text-muted truncate">@{author.username}</div>
        </div>
        <div className="text-2xs text-text-muted font-mono shrink-0">
          Joined {formatDate(author.created)}
        </div>
      </button>
    );
  };

  const moodGrid = (list: ExploreCrux[]) => (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] p-3">
      {list.map((crux) => (
        <MoodResultCard
          key={crux.id}
          crux={crux}
          canInstall={appReady}
          onOpen={() => handleNavigate(`/${crux.author_username}/${crux.slug}`)}
          onInstall={async (apply) => {
            const [{ installMoodFromPublished }, { chooseMood }, { putBlob }] = await Promise.all([
              import('@/lib/moods/publish-mood'),
              import('@/services/garden-mood'),
              import('@/services/blobs'),
            ]);
            const pkg = await installMoodFromPublished(crux, {
              publishBaseUrl: publishBaseUrlFor,
              fetchBlob: async (url) => {
                // No publish origin configured (dev, tests): the URL would be
                // relative to the app shell, which answers everything with index.html.
                if (!hasRemotePublishOrigin()) return null;
                const r = await fetch(url);
                if (!r.ok) return null;
                const type = r.headers.get('content-type') || '';
                return type.startsWith('text/html') ? null : r.blob();
              },
              apiArtifacts: publicApi.getArtifacts,
              apiDownload: publicApi.downloadArtifact,
              putBlob,
            });
            if (!pkg) throw new Error('No package found');
            if (apply) await chooseMood(pkg);
          }}
        />
      ))}
    </div>
  );
  const toolGrid = (list: ExploreCrux[]) => (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(240px,1fr))] p-3">
      {list.map((crux) => (
        <ToolResultCard
          key={crux.id}
          crux={crux}
          canInstall={appReady}
          onOpen={() => handleNavigate(`/${crux.author_username}/${crux.slug}`)}
          onInstall={async (report) => {
            const [{ installToolFromPublished }, { putBlob }] = await Promise.all([
              import('@/services/crux-tools/installed'),
              import('@/services/blobs'),
            ]);
            await installToolFromPublished(crux, {
              apiDownload: publicApi.downloadArtifact,
              putBlob,
              onProgress: report,
            });
          }}
        />
      ))}
    </div>
  );
  const cruxList = (list: ExploreCrux[]) => (
    <div className="flex flex-col">
      {list.map((crux) => (
        <CruxCard key={crux.id} crux={crux} />
      ))}
    </div>
  );
  const peopleList = (list: ExploreAuthor[]) => (
    <div className="flex flex-col">
      {list.map((a) => (
        <AuthorCard key={a.id} author={a} />
      ))}
    </div>
  );
  /** A group in the All view: a heading, its results, and a way to see more of that kind. */
  const group = (title: string, to: ExploreView, count: number, body: React.ReactNode) =>
    count > 0 ? (
      <section aria-label={title} className="mb-4">
        <div className="flex items-baseline justify-between px-4 pt-3 pb-1">
          <SectionLabel>{title}</SectionLabel>
          <button
            type="button"
            onClick={() => changeView(to)}
            className="text-xxs font-mono text-text-muted hover:text-accent cursor-pointer"
          >
            All {title.toLowerCase()} →
          </button>
        </div>
        {body}
      </section>
    ) : null;

  return (
    <div
      className="overflow-y-auto flex-1 @container"
      style={
        {
          // Explore is the command palette surface (commandPalette* tokens)
          '--panel': 'var(--command-palette)',
          '--panel-border': 'var(--command-palette-border)',
          '--surface': 'var(--command-palette-item)',
          '--accent-muted': 'var(--command-palette-item-hover)',
          '--input': 'var(--command-palette-input)',
          '--input-text': 'var(--command-palette-input-text)',
          '--text': 'var(--command-palette-item-text)',
          '--text-muted': 'var(--command-palette-item-icon)',
        } as React.CSSProperties
      }
    >
      <Panel padding="sm" className="sm:p-5 mb-4">
        {/* One search for everything */}
        <div className="relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon size={16} />
          </div>
          <input
            ref={inputRef}
            type="text"
            defaultValue={initial?.q ?? ''}
            onChange={handleSearchChange}
            onKeyDown={(e) => {
              // Enter asks again even when the words are the same (a listing may have changed).
              if (e.key === 'Enter') {
                clearTimeout(debounceRef.current);
                setQ(e.currentTarget.value);
                setAttempt((n) => n + 1);
              }
            }}
            placeholder="Search cruxes, people, tools, moods and authors… (@name, #tag)"
            aria-label="Search Explore"
            className="w-full pl-10 pr-9 py-2.5 text-sm bg-surface/50 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text-muted/50 focus:outline-none focus:border-input-border-active focus:ring-1 focus:ring-input-outline font-body"
            autoFocus
          />
          {q && (
            <button
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>

        {/* What to look through */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <div role="tablist" aria-label="Look through" className="flex items-center gap-1 text-xs">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={view === v.id}
                onClick={() => changeView(v.id)}
                className={cn(
                  'px-3 py-1 rounded-[var(--radius-sm)] cursor-pointer transition-colors',
                  view === v.id ? 'text-text bg-surface' : 'text-text-muted hover:text-text',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-xs font-mono text-text-muted">
            <span className="sr-only">Sort</span>
            {SORTS.filter((s) => s.id !== 'relevant' || q).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSort(s.id);
                  setPage(1);
                }}
                aria-pressed={sort === s.id}
                className={cn(
                  'px-2 py-0.5 rounded-[var(--radius-sm)] cursor-pointer',
                  sort === s.id ? 'text-text bg-surface' : 'hover:text-text',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* What is filtering right now */}
        {(author || activeTags.length > 0 || kind) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3" data-testid="active-filters">
            {author && (
              <button
                type="button"
                onClick={() => {
                  setAuthor('');
                  setPage(1);
                }}
                className="px-2 py-0.5 rounded-chip text-xxs font-mono bg-accent text-bg cursor-pointer"
                aria-label={`Remove author filter ${author}`}
              >
                @{author} ×
              </button>
            )}
            {activeTags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className="px-2 py-0.5 rounded-chip text-xxs font-mono bg-accent text-bg cursor-pointer"
                aria-label={`Remove tag filter ${t}`}
              >
                #{t} ×
              </button>
            ))}
            {kind && view === 'cruxes' && (
              <button
                type="button"
                onClick={() => {
                  setKind('');
                  setPage(1);
                }}
                className="px-2 py-0.5 rounded-chip text-xxs font-mono bg-accent text-bg cursor-pointer"
                aria-label={`Remove kind filter ${KIND_LABEL[kind] ?? kind}`}
              >
                {KINDS.find((k) => k.id === kind)?.label ?? kind} ×
              </button>
            )}
            <button
              type="button"
              onClick={clearFilters}
              className="text-xxs text-text-muted hover:text-text cursor-pointer ml-1"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Tags: the way in */}
        {view !== 'people' && tags.length > 0 && (
          <div className="mt-3" data-testid="explore-tags">
            <div className="flex items-baseline justify-between mb-1.5">
              <SectionLabel>Browse by tag</SectionLabel>
              {tags.length > TAGS_SHOWN && (
                <button
                  type="button"
                  onClick={() => setAllTags((v) => !v)}
                  className="text-xxs font-mono text-text-muted hover:text-text cursor-pointer"
                >
                  {allTags ? 'Fewer tags' : `All ${tags.length} tags`}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {shownTags.map((tag) => (
                <TagChip
                  key={tag.label}
                  label={tag.label}
                  count={tag.count}
                  active={activeTags.includes(tag.label)}
                  onClick={() => toggleTag(tag.label)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Under Cruxes: what kind */}
        {view === 'cruxes' && (
          <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.id || 'all'}
                type="button"
                onClick={() => {
                  setKind(k.id);
                  setPage(1);
                }}
                aria-pressed={kind === k.id}
                className={cn(
                  'px-2.5 py-1 rounded-chip text-xxs border cursor-pointer transition-colors',
                  kind === k.id
                    ? 'bg-accent text-bg border-accent font-medium'
                    : 'bg-surface/50 text-text-muted border-border hover:text-text',
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* Results */}
      {!loadedOnce && loading ? (
        <Panel padding="md" className="flex items-center justify-center gap-2 py-16">
          <Spinner size={14} />
          <p className="text-text-muted text-sm">Looking…</p>
        </Panel>
      ) : failed && empty ? (
        <Panel padding="md" className="flex flex-col items-center py-10 text-center" role="alert">
          <p className="text-text text-sm mb-1">Couldn't reach crux.garden</p>
          <p className="text-xs text-text-muted mb-3">Check your connection and try again.</p>
          <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Panel>
      ) : empty ? (
        <Panel padding="md" className="flex flex-col items-center py-10 text-center">
          <p className="text-text text-sm mb-1">
            {hasFilters ? 'No results match your search' : 'Nothing here yet'}
          </p>
          {tags.length > 0 && (
            <>
              <p className="text-xs text-text-muted mb-3">Try a tag:</p>
              <div className="flex flex-wrap justify-center gap-1.5 mb-3">
                {tags.slice(0, 8).map((tag) => (
                  <TagChip
                    key={tag.label}
                    label={tag.label}
                    count={tag.count}
                    active={activeTags.includes(tag.label)}
                    onClick={() => {
                      if (!activeTags.includes(tag.label)) setActiveTags([tag.label]);
                      setQ('');
                      if (inputRef.current) inputRef.current.value = '';
                      setPage(1);
                    }}
                  />
                ))}
              </div>
            </>
          )}
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </Panel>
      ) : (
        <div className={cn(loading && 'opacity-60 transition-opacity')} aria-busy={loading}>
          {view === 'all' && (
            <>
              {group('People', 'people', people.length, peopleList(people))}
              {group('Cruxes', 'cruxes', byKind.rest.length, cruxList(byKind.rest))}
              {group('Tools', 'tools', byKind.tools.length, toolGrid(byKind.tools))}
              {group('Moods', 'moods', byKind.moods.length, moodGrid(byKind.moods))}
            </>
          )}
          {view === 'cruxes' && cruxList(cruxes)}
          {view === 'people' && peopleList(people)}
          {view === 'tools' && toolGrid(cruxes)}
          {view === 'moods' && moodGrid(cruxes)}

          {/* Pagination */}
          {view !== 'all' && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 mb-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-default cursor-pointer"
              >
                Prev
              </button>
              <span className="text-xs font-mono text-text-muted">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-default cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Public route page (with URL param syncing) ────────── */

export function ExplorePage() {
  // Page title
  useEffect(() => {
    document.title = `Explore - ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  // Filters live in the URL so every search is a link (the website embeds this
  // page). Values are validated here — anything can arrive in a query string.
  const [params, setParams] = useSearchParams();
  const paramsKey = params.toString();
  const initial: Partial<ExploreState> = parseExploreParams(params);

  // Explore owns its filter state after mount and mirrors it out to the URL.
  // When the URL changes for another reason — a link into this page while it
  // is already mounted, back/forward — remount Explore so it picks the new
  // filters up. Changes we wrote ourselves are recognised and leave it alone.
  const lastWritten = useRef<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    if (lastWritten.current !== null && lastWritten.current !== paramsKey) {
      setEpoch((e) => e + 1);
    }
    lastWritten.current = paramsKey;
  }, [paramsKey]);

  const onStateChange = useCallback(
    (s: ExploreState) => {
      const next = new URLSearchParams();
      if (s.q) next.set('q', s.q);
      if (s.type !== 'all') next.set('type', s.type);
      if (s.sort !== (s.q ? 'relevant' : 'recent')) next.set('sort', s.sort);
      if (s.kind) next.set('kind', s.kind);
      for (const t of s.tags) next.append('tag', t);
      if (s.author) next.set('author', s.author);
      if (s.page > 1) next.set('page', String(s.page));
      const nextKey = next.toString();
      if (nextKey !== paramsKey) {
        lastWritten.current = nextKey;
        setParams(next, { replace: true });
      }
    },
    [paramsKey, setParams],
  );

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader title="Explore" />

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <Explore key={epoch} initial={initial} onStateChange={onStateChange} />
      </div>
    </div>
  );
}
