import { openGardenPage } from '@/lib/public-url';
import { SearchIcon, CloseIcon } from '@/components/ui/icons';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { publicApi, API_BASE_URL } from '@/api';
import type {
  ExploreCrux,
  ExploreAuthor,
  ExploreTag,
  ExploreParams,
  ExploreSort,
} from '@/api/public';
import { parseExploreParams } from './explore-params';
import { useAppStore } from '@/stores/appStore';
import { useUIStore } from '@/stores/uiStore';
import MoodResultCard from '@/components/explore/MoodResultCard';
import { publishBaseUrlFor } from '@/lib/public-url';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { publicCoverUrl } from '@/lib/public-cover';
import { APP_NAME } from '@/lib/constants';

type ResultType = 'cruxes' | 'authors';

const KINDS: { id: string; label: string }[] = [
  { id: '', label: 'Everything' },
  { id: 'webapp', label: 'Sites' },
  { id: 'page', label: 'Pages' },
  { id: 'notes', label: 'Notes' },
  { id: 'document', label: 'Documents' },
  { id: 'image', label: 'Images' },
  { id: 'mood', label: 'Moods' },
];
const KIND_LABEL: Record<string, string> = {
  webapp: 'Site',
  page: 'Page',
  notes: 'Notes',
  document: 'Document',
  image: 'Image',
  mood: 'Mood',
};

function resolveAvatarUrl(meta?: Record<string, unknown>): string | null {
  const url = meta?.avatarUrl || meta?.avatar_url;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:')) return url;
  return `${API_BASE_URL}${url}`;
}

function Avatar({ url, size = 'sm' }: { url: string | null; size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'w-10 h-10' : 'w-6 h-6';
  return (
    <div
      className={cn(
        dim,
        'rounded-[var(--radius-sm)] overflow-hidden flex items-center justify-center shrink-0 bg-surface ring-1 ring-text-muted/20',
      )}
    >
      {url && <img src={url} alt="" className="w-full h-full object-cover" />}
    </div>
  );
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

/* ── Explore (reusable in page and modal) ─────────────── */

/** The filter state Explore exposes — the public page mirrors it into the URL. */
export interface ExploreState {
  q: string;
  type: ResultType;
  sort: ExploreSort;
  kind: string;
  tags: string[];
  author: string;
  page: number;
}

export default function Explore({
  onNavigate,
  initial,
  onStateChange,
}: {
  onNavigate?: () => void;
  initial?: Partial<ExploreState>;
  onStateChange?: (state: ExploreState) => void;
}) {
  const navigate = useNavigate();

  const [q, setQ] = useState(initial?.q ?? '');
  const [resultType, setResultType] = useState<ResultType>(initial?.type ?? 'cruxes');
  const [sort, setSort] = useState<ExploreSort>(
    initial?.sort ?? (initial?.q ? 'relevant' : 'recent'),
  );
  const [author, setAuthor] = useState(initial?.author ?? '');
  // Inside the app (services ready) results can be installed / opened locally
  const appReady = useAppStore((s) => s.ready);
  const [kind, setKind] = useState<string>(
    () => initial?.kind ?? useUIStore.getState().exploreKind ?? '',
  );
  useEffect(() => {
    // one-shot: the opener asked for a kind
    if (useUIStore.getState().exploreKind) useUIStore.setState({ exploreKind: null });
  }, []);
  const [activeTags, setActiveTags] = useState<string[]>(initial?.tags ?? []);
  const [page, setPage] = useState(initial?.page ?? 1);

  // Mirror state outward (the public page writes it to the URL so searches are links)
  useEffect(() => {
    onStateChange?.({ q, type: resultType, sort, kind, tags: activeTags, author, page });
  }, [q, resultType, sort, kind, activeTags, author, page, onStateChange]);

  const [results, setResults] = useState<(ExploreCrux | ExploreAuthor)[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [tags, setTags] = useState<ExploreTag[]>([]);
  const [loading, setLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load popular tags once
  useEffect(() => {
    publicApi
      .exploreTags(50, kind || undefined)
      .then(setTags)
      .catch(() => setTags([]));
  }, [kind]);

  // Fetch results
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: ExploreParams = {
      type: resultType,
      sort,
      page,
      perPage: 24,
    };
    if (q) params.q = q;
    if (kind) params.kind = kind;
    if (author) params.author = author;
    if (activeTags.length > 0) params.tag = activeTags;

    publicApi
      .explore(params)
      .then((data) => {
        if (cancelled) return;
        setResults(data.items);
        setTotalPages(data.totalPages);
      })
      .catch(() => {
        if (cancelled) return;
        setResults([]);
        setTotalPages(1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, resultType, sort, activeTags, kind, author, page]);

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
    setResultType('cruxes');
    setPage(1);
  }, []);

  const toggleTag = useCallback((label: string) => {
    setActiveTags((prev) =>
      prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label],
    );
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

  // Open in new tab when used in a modal, navigate inline for the public page
  const handleNavigate = useCallback(
    (path: string) => {
      if (onNavigate) {
        void openGardenPage(path);
        onNavigate(); // close the modal — it was never called before
      } else {
        navigate(path);
      }
    },
    [navigate, onNavigate],
  );

  const hasFilters =
    q ||
    activeTags.length > 0 ||
    author ||
    (sort !== 'recent' && sort !== 'relevant') ||
    kind !== '';

  // Override navigate in card clicks
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
        className="w-full px-4 py-3 text-left hover:bg-accent-muted/30 cursor-pointer group flex items-center gap-3 border-b border-border last:border-b-0 motion-enter-card"
      >
        <CoverThumb cruxId={crux.id} />
        <Avatar url={avatarUrl} />
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
            <div className="flex flex-wrap gap-1 mt-1">
              {crux.tags.slice(0, 6).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTag(t);
                  }}
                  className="text-3xs font-mono px-1.5 py-0.5 rounded-chip bg-surface text-text-muted hover:text-accent cursor-pointer"
                >
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            aria-label={`Only cruxes by ${crux.author_username}`}
            onClick={(e) => {
              e.stopPropagation();
              filterByAuthor(crux.author_username);
            }}
            className="text-2xs font-mono text-text-muted hover:text-accent cursor-pointer"
          >
            @{crux.author_username}
          </button>
          <span className="text-2xs font-mono text-text-muted">{formatDate(crux.created)}</span>
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
        <Avatar url={avatarUrl} size="md" />
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

  return (
    <div
      className="overflow-y-auto flex-1"
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
      {/* Search + filters */}
      <div className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-text-muted hover:text-text cursor-pointer ml-auto"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Search input */}
        <div className="relative mb-4">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            <SearchIcon size={14} />
          </div>
          <input
            ref={inputRef}
            type="text"
            defaultValue={initial?.q ?? ''}
            onChange={handleSearchChange}
            placeholder="Search cruxes, moods and authors… (@name, #tag)"
            className="w-full pl-9 pr-8 py-2 text-sm bg-surface/50 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text-muted/50 focus:outline-none focus:border-input-border-active focus:ring-1 focus:ring-input-outline font-body"
            autoFocus
          />
          {q && (
            <button
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>

        {/* Active filters */}
        {(author || activeTags.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3" data-testid="active-filters">
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
          </div>
        )}

        {/* Type toggle + sort */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-mono">
            <button
              onClick={() => {
                setResultType('cruxes');
                setPage(1);
              }}
              className={cn(
                'px-3 py-1 rounded-[var(--radius-sm)] cursor-pointer',
                resultType === 'cruxes'
                  ? 'text-text bg-surface'
                  : 'text-text-muted hover:text-text',
              )}
            >
              Cruxes
            </button>
            <button
              onClick={() => {
                setResultType('authors');
                setPage(1);
              }}
              className={cn(
                'px-3 py-1 rounded-[var(--radius-sm)] cursor-pointer',
                resultType === 'authors'
                  ? 'text-text bg-surface'
                  : 'text-text-muted hover:text-text',
              )}
            >
              Authors
            </button>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono text-text-muted">
            <span>Sort</span>
            {q && (
              <button
                onClick={() => {
                  setSort('relevant');
                  setPage(1);
                }}
                className={cn(
                  'px-2 py-0.5 rounded-[var(--radius-sm)] cursor-pointer',
                  sort === 'relevant' ? 'text-text bg-surface' : 'hover:text-text',
                )}
              >
                Best match
              </button>
            )}
            <button
              onClick={() => {
                setSort('recent');
                setPage(1);
              }}
              className={cn(
                'px-2 py-0.5 rounded-[var(--radius-sm)] cursor-pointer',
                sort === 'recent' ? 'text-text bg-surface' : 'hover:text-text',
              )}
            >
              Recent
            </button>
            <button
              onClick={() => {
                setSort('newest');
                setPage(1);
              }}
              className={cn(
                'px-2 py-0.5 rounded-[var(--radius-sm)] cursor-pointer',
                sort === 'newest' ? 'text-text bg-surface' : 'hover:text-text',
              )}
            >
              Newest
            </button>
            <button
              onClick={() => {
                setSort('alpha');
                setPage(1);
              }}
              className={cn(
                'px-2 py-0.5 rounded-[var(--radius-sm)] cursor-pointer',
                sort === 'alpha' ? 'text-text bg-surface' : 'hover:text-text',
              )}
            >
              A-Z
            </button>
          </div>
        </div>

        {/* Kind chips */}
        {resultType === 'cruxes' && (
          <div className="flex flex-wrap gap-1.5 mt-3" role="group" aria-label="Kind">
            {KINDS.map((k) => (
              <button
                key={k.id || 'all'}
                type="button"
                onClick={() => {
                  setKind(k.id);
                  setActiveTags([]);
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
      </div>

      {/* Tag cloud */}
      {resultType === 'cruxes' && tags.length > 0 && (
        <div className="bg-panel border border-border rounded-[var(--radius)] p-4 mb-6">
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag.label}
                onClick={() => toggleTag(tag.label)}
                className={cn(
                  'px-2.5 py-1 text-xs font-mono rounded-chip cursor-pointer border',
                  activeTags.includes(tag.label)
                    ? 'bg-accent text-bg border-accent'
                    : 'bg-surface/50 text-text-muted border-border hover:text-text hover:border-text-muted',
                )}
              >
                {tag.label}
                <span className="ml-1 opacity-50">{tag.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="bg-panel border border-border rounded-[var(--radius)] flex items-center justify-center py-16">
          <p className="text-text-muted text-sm font-mono">Loading...</p>
        </div>
      ) : results.length === 0 ? (
        <div className="bg-panel border border-border rounded-[var(--radius)] flex flex-col items-center py-10">
          <p className="text-text-muted text-sm mb-3">
            {hasFilters ? 'No results match your search' : 'Nothing here yet'}
          </p>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {resultType === 'cruxes' && kind === 'mood' && (
            <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))] p-3">
              {(results as ExploreCrux[]).map((crux) => (
                <MoodResultCard
                  key={crux.id}
                  crux={crux}
                  canInstall={appReady}
                  onOpen={() => handleNavigate(`/${crux.author_username}/${crux.slug}`)}
                  onInstall={async (apply) => {
                    const [{ installMoodFromPublished }, { applyMood }, { putBlob }] =
                      await Promise.all([
                        import('@/lib/moods/publish-mood'),
                        import('@/lib/moods/packages'),
                        import('@/services/blobs'),
                      ]);
                    const pkg = await installMoodFromPublished(crux, {
                      publishBaseUrl: publishBaseUrlFor,
                      fetchBlob: async (url) => {
                        const r = await fetch(url);
                        return r.ok ? r.blob() : null;
                      },
                      apiArtifacts: publicApi.getArtifacts,
                      apiDownload: publicApi.downloadArtifact,
                      putBlob,
                    });
                    if (!pkg) throw new Error('No package found');
                    if (apply) await applyMood(pkg);
                  }}
                />
              ))}
            </div>
          )}
          <div className="flex flex-col">
            {resultType === 'cruxes'
              ? kind === 'mood'
                ? null
                : (results as ExploreCrux[]).map((crux) => <CruxCard key={crux.id} crux={crux} />)
              : (results as ExploreAuthor[]).map((author) => (
                  <AuthorCard key={author.id} author={author} />
                ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
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
        </>
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
      if (s.type !== 'cruxes') next.set('type', s.type);
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
      <header className="relative z-20 flex items-center h-8 px-3 border-b border-border bg-surface-solid shrink-0">
        <div className="flex items-center gap-1.5 text-2xs font-mono">
          <a href="/" className="shrink-0 text-text-muted hover:underline">
            {APP_NAME}
          </a>
          <span className="text-text-muted/40">/</span>
          <span className="text-text">Explore</span>
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <Explore key={epoch} initial={initial} onStateChange={onStateChange} />
      </div>
    </div>
  );
}
