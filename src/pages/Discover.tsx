import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { publicApi, API_BASE_URL } from '@/api';
import type {
  DiscoverCrux,
  DiscoverAuthor,
  DiscoverTag,
  DiscoverParams,
} from '@/api/public';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';
import MoodBar from '@/components/layout/MoodBar';

type ResultType = 'cruxes' | 'authors';

function resolveAvatarUrl(meta?: Record<string, unknown>): string | null {
  const url = meta?.avatarUrl;
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

/* ── Crux result card ─────────────────────────────────── */

function CruxResultCard({ crux }: { crux: DiscoverCrux }) {
  const navigate = useNavigate();
  const href = `/${crux.author_username}/${crux.slug}`;
  const avatarUrl = resolveAvatarUrl(crux.author_meta);

  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        'bg-panel border border-border rounded-[var(--radius)] p-4 text-left',
        'hover:bg-accent-muted hover:text-accent hover:border-accent transition-all duration-200 cursor-pointer',
        'w-full h-36 flex flex-col',
      )}
    >
      <h3 className="font-display text-sm font-medium text-text truncate">
        {crux.title || crux.slug}
      </h3>
      {crux.description && (
        <p className="text-xs text-text-muted line-clamp-2 leading-relaxed mt-1.5">
          {crux.description}
        </p>
      )}
      <div className="flex-1" />
      <div className="flex items-center justify-between text-[10px] text-text-muted font-mono">
        <div className="flex items-center gap-1.5">
          <Avatar url={avatarUrl} />
          <span>@{crux.author_username}</span>
        </div>
        <span>{formatDate(crux.created)}</span>
      </div>
    </button>
  );
}

/* ── Author result card ────────────────────────────────── */

function AuthorResultCard({ author }: { author: DiscoverAuthor }) {
  const navigate = useNavigate();
  const avatarUrl = resolveAvatarUrl(author.meta);

  return (
    <button
      onClick={() => navigate(`/${author.username}`)}
      className={cn(
        'bg-panel border border-border rounded-[var(--radius)] p-4 text-left',
        'hover:bg-accent-muted hover:text-accent hover:border-accent transition-all duration-200 cursor-pointer',
        'w-full h-36 flex flex-col',
      )}
    >
      <div className="flex items-center gap-2.5">
        <Avatar url={avatarUrl} size="md" />
        <div className="min-w-0">
          <h3 className="font-display text-sm font-medium text-text truncate">
            {author.display_name || author.username}
          </h3>
          <p className="text-xs text-text-muted font-mono">@{author.username}</p>
        </div>
      </div>
      {author.bio && (
        <p className="text-xs text-text-muted line-clamp-2 leading-relaxed mt-2">
          {author.bio}
        </p>
      )}
      <div className="flex-1" />
      <div className="text-[10px] text-text-muted font-mono">
        Joined {formatDate(author.created)}
      </div>
    </button>
  );
}

/* ── Main page ──────────────────────────────────────────── */

export default function Discover() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read initial state from URL
  const initialQ = searchParams.get('q') || '';
  const initialType = (searchParams.get('type') as ResultType) || 'cruxes';
  const initialSort = (searchParams.get('sort') as 'recent' | 'alpha') || 'recent';
  const initialTags = searchParams.getAll('tag');

  const [q, setQ] = useState(initialQ);
  const [resultType, setResultType] = useState<ResultType>(initialType);
  const [sort, setSort] = useState<'recent' | 'alpha'>(initialSort);
  const [activeTags, setActiveTags] = useState<string[]>(initialTags);
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<(DiscoverCrux | DiscoverAuthor)[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [tags, setTags] = useState<DiscoverTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTagsLoading] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Page title
  useEffect(() => {
    document.title = `Discover - ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, []);

  // Load popular tags once
  useEffect(() => {
    setTagsLoading(true);
    publicApi
      .discoverTags(50)
      .then(setTags)
      .catch(() => setTags([]))
      .finally(() => setTagsLoading(false));
  }, []);

  // Sync URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (resultType !== 'cruxes') params.set('type', resultType);
    if (sort !== 'recent') params.set('sort', sort);
    for (const t of activeTags) params.append('tag', t);
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [q, resultType, sort, activeTags, page, setSearchParams]);

  // Fetch results
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params: DiscoverParams = {
      type: resultType,
      sort,
      page,
      perPage: 24,
    };
    if (q) params.q = q;
    if (activeTags.length > 0) params.tag = activeTags;

    publicApi
      .discover(params)
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

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setQ(value);
        setPage(1);
      }, 300);
    },
    [],
  );

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

  const hasFilters = q || activeTags.length > 0 || sort !== 'recent';

  return (
    <div className="flex flex-col min-h-screen">
      <header className="relative z-20 flex items-center h-8 px-3 border-b border-border bg-surface-solid shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <a href="/" className="shrink-0 text-text-muted hover:underline">
            {APP_NAME}
          </a>
          <span className="text-text-muted/40">/</span>
          <span className="text-text">Discover</span>
        </div>
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Header panel */}
        <div className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-display text-lg font-medium text-text">Discover</h1>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
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
              defaultValue={initialQ}
              onChange={handleSearchChange}
              placeholder="Search cruxes and authors..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-surface/50 border border-border rounded-[var(--radius-sm)] text-text placeholder:text-text-muted/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors font-body"
            />
            {q && (
              <button
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors cursor-pointer"
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
                  'px-3 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
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
                  'px-3 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
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
                  'px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
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
                  'px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
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
                    'px-2.5 py-1 text-xs font-mono rounded-[var(--radius-sm)] transition-colors cursor-pointer border',
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {resultType === 'cruxes'
                ? (results as DiscoverCrux[]).map((crux) => (
                    <CruxResultCard key={crux.id} crux={crux} />
                  ))
                : (results as DiscoverAuthor[]).map((author) => (
                    <AuthorResultCard key={author.id} author={author} />
                  ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 mb-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs font-mono text-text-muted">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <MoodBar />
    </div>
  );
}
