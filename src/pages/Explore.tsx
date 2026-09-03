import { openGardenPage } from '@/lib/public-url';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { publicApi, API_BASE_URL } from '@/api';
import type { ExploreCrux, ExploreAuthor, ExploreTag, ExploreParams } from '@/api/public';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { APP_NAME } from '@/lib/constants';

type ResultType = 'cruxes' | 'authors';

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

/* ── Search icon ─────────────────────────────────────── */

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

/* ── Explore (reusable in page and modal) ─────────────── */

export default function Explore({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [resultType, setResultType] = useState<ResultType>('cruxes');
  const [sort, setSort] = useState<'recent' | 'alpha'>('recent');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<(ExploreCrux | ExploreAuthor)[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [tags, setTags] = useState<ExploreTag[]>([]);
  const [loading, setLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load popular tags once
  useEffect(() => {
    publicApi
      .exploreTags(50)
      .then(setTags)
      .catch(() => setTags([]));
  }, []);

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
  }, [q, resultType, sort, activeTags, page]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(value);
      setPage(1);
    }, 300);
  }, []);

  const handleClear = useCallback(() => {
    if (inputRef.current) inputRef.current.value = '';
    setQ('');
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
    setSort('recent');
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

  const hasFilters = q || activeTags.length > 0 || sort !== 'recent';

  // Override navigate in card clicks
  const CruxCard = ({ crux }: { crux: ExploreCrux }) => {
    const href = `/${crux.author_username}/${crux.slug}`;
    const avatarUrl = resolveAvatarUrl(crux.author_meta);
    return (
      <button
        onClick={() => handleNavigate(href)}
        className="w-full px-4 py-3 text-left hover:bg-accent-muted/30 cursor-pointer group flex items-center gap-3 border-b border-border last:border-b-0"
      >
        <Avatar url={avatarUrl} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm font-medium text-text group-hover:text-accent truncate">
            {crux.title}
          </div>
          {crux.description && (
            <p className="text-xs text-text-muted truncate">{crux.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono text-text-muted">{crux.author_username}</span>
          <span className="text-[10px] font-mono text-text-muted">{formatDate(crux.created)}</span>
        </div>
      </button>
    );
  };

  const AuthorCard = ({ author }: { author: ExploreAuthor }) => {
    const avatarUrl = resolveAvatarUrl(author.meta);
    return (
      <button
        onClick={() => handleNavigate(`/${author.username}`)}
        className="w-full px-4 py-3 text-left hover:bg-accent-muted/30 cursor-pointer group flex items-center gap-3 border-b border-border last:border-b-0"
      >
        <Avatar url={avatarUrl} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-display text-sm font-medium text-text group-hover:text-accent truncate">
            {author.display_name || author.username}
          </div>
          <div className="text-xs font-mono text-text-muted truncate">@{author.username}</div>
        </div>
        <div className="text-[10px] text-text-muted font-mono shrink-0">
          Joined {formatDate(author.created)}
        </div>
      </button>
    );
  };

  return (
    <div className="overflow-y-auto flex-1">
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
            <SearchIcon />
          </div>
          <input
            ref={inputRef}
            type="text"
            onChange={handleSearchChange}
            placeholder="Search cruxes and authors..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-surface/50 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 font-body"
            autoFocus
          />
          {q && (
            <button
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text cursor-pointer"
            >
              <ClearIcon />
            </button>
          )}
        </div>

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
                  'px-2.5 py-1 text-xs font-mono rounded-[var(--radius-sm)] cursor-pointer border',
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
          <div className="flex flex-col">
            {resultType === 'cruxes'
              ? (results as ExploreCrux[]).map((crux) => <CruxCard key={crux.id} crux={crux} />)
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

  // Read initial query from URL for the public route header
  return (
    <div className="flex flex-col min-h-screen">
      <header className="relative z-20 flex items-center h-8 px-3 border-b border-border bg-surface-solid shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <a href="/" className="shrink-0 text-text-muted hover:underline">
            {APP_NAME}
          </a>
          <span className="text-text-muted/40">/</span>
          <span className="text-text">Explore</span>
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        <Explore />
      </div>
    </div>
  );
}
