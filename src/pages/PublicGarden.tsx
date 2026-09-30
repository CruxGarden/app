import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import PublicLoading from '@/components/display/PublicLoading';
import { PublicApiError } from '@/api/public';
import DeadEnd from '@/components/layout/DeadEnd';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Author, Crux } from '@/api/types';
import { resolveAvatarUrl } from '@/stores/authStore';
import { PublicTopBar } from '@/components/display';
import { GardenGrid } from '@/components/garden';
import { Button, Panel, SegmentedControl, fieldClass, buttonClass } from '@/components/ui';
import { APP_NAME } from '@/lib/constants';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';
type SortField = 'created' | 'updated';

export default function PublicGarden() {
  const { username } = useParams<{ username: string }>();

  const [author, setAuthor] = useState<Author | null>(null);
  const [cruxes, setCruxes] = useState<Crux[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('created');

  useEffect(() => {
    if (!username) {
      setState('not-found');
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    setMoreLoading(false);
    setMoreFailed(false);
    setState('loading');
    setAuthor(null);
    setCruxes([]);
    setSearch('');

    // Load from API only — no local database access on public pages
    Promise.all([
      publicApi.getAuthor(username, controller.signal),
      publicApi.getAuthorCruxes(username, { page: 1, perPage: 24 }, controller.signal),
    ])
      .then(([author, data]) => {
        if (controller.signal.aborted) return;
        setAuthor(author);
        setCruxes(data.cruxes);
        setCurrentPage(data.currentPage);
        setTotalPages(data.totalPages);
        setState('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (err instanceof PublicApiError && err.status === 404) {
          setState('not-found');
        } else {
          setState('error');
        }
      });

    return () => {
      controller.abort();
    };
  }, [username, attempt]);

  const loadMore = async () => {
    const controller = request.current;
    if (!username || !controller || controller.signal.aborted || moreLoading) return;
    setMoreLoading(true);
    setMoreFailed(false);
    try {
      const data = await publicApi.getAuthorCruxes(
        username,
        { page: currentPage + 1, perPage: 24 },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (data.currentPage !== currentPage + 1) throw new Error('Unexpected page');
      setCruxes((previous) => [
        ...new Map([...previous, ...data.cruxes].map((c) => [c.id, c])).values(),
      ]);
      setCurrentPage(data.currentPage);
      setTotalPages(data.totalPages);
    } catch {
      if (!controller.signal.aborted) setMoreFailed(true);
    } finally {
      if (!controller.signal.aborted) setMoreLoading(false);
    }
  };

  useEffect(() => {
    if (author?.username) {
      document.title = `${author.username} - ${APP_NAME}`;
    }
    return () => {
      document.title = APP_NAME;
    };
  }, [author?.username]);

  const linkBuilder = useCallback((crux: Crux) => `/${username}/${crux.slug}`, [username]);

  // Client-side search + sort
  const filteredCruxes = useMemo(() => {
    const needle = search.toLowerCase();
    const filtered = needle
      ? cruxes.filter(
          (c) =>
            (c.title || '').toLowerCase().includes(needle) ||
            (c.slug || '').toLowerCase().includes(needle) ||
            (c.description || '').toLowerCase().includes(needle),
        )
      : cruxes;
    return [...filtered].sort(
      (a, b) => new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime(),
    );
  }, [cruxes, search, sortBy]);

  const avatarUrl = resolveAvatarUrl(author);
  if (state === 'loading') {
    return <PublicLoading label="Loading garden…" username={username} />;
  }

  if (state === 'not-found') {
    return (
      <Missing
        title="No garden here"
        body={`There is no @${username?.replace(/^@/, '')} at this address.`}
      />
    );
  }

  if (state === 'error') {
    return (
      <DeadEnd title="Couldn't reach this garden" body="Check your connection and try again.">
        <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
        <Link to="/explore" className={buttonClass('ghost', 'sm')}>
          Explore
        </Link>
      </DeadEnd>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PublicTopBar username={username || ''} />

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Header + Search panel */}
        <Panel padding="sm" className="sm:p-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-[var(--radius)] overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-text-muted/20 bg-surface">
              {avatarUrl && <img src={avatarUrl} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-medium text-text truncate">
                {author?.username || username}
              </h1>
              <p className="text-sm text-text-muted">Public Garden</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1">
              <input
                aria-label="Search loaded Cruxes"
                placeholder="Search loaded Cruxes…"
                className={fieldClass()}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <SegmentedControl
              label="Sort by"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'created', label: 'Created' },
                { value: 'updated', label: 'Updated' },
              ]}
              className="h-9 shrink-0"
            />
          </div>
        </Panel>

        <p className="text-sm text-text-muted mb-4">
          {cruxes.length} loaded · search and sorting apply to these Cruxes.{' '}
          <Link
            className={buttonClass('ghost', 'sm')}
            to={`/explore?author=${encodeURIComponent(username?.replace(/^@/, '') ?? '')}`}
          >
            Search this author in Explore
          </Link>
        </p>
        {/* Content */}
        {filteredCruxes.length === 0 ? (
          <Panel padding="md" className="flex flex-col items-center py-10">
            <p className="text-text-muted text-sm mb-3">
              {search ? 'No cruxes match your search' : 'No published cruxes yet'}
            </p>
            {search && (
              <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
                Clear search
              </Button>
            )}
          </Panel>
        ) : (
          <GardenGrid cruxes={filteredCruxes} linkBuilder={linkBuilder} sortBy={sortBy} hideMenu />
        )}
        {currentPage < totalPages && (
          <div className="flex flex-col items-center gap-2 mt-6">
            {moreFailed && (
              <p role="alert">Couldn’t load more Cruxes. Your current results are still here.</p>
            )}
            <Button disabled={moreLoading} onClick={() => void loadMore()}>
              {moreLoading
                ? 'Loading…'
                : moreFailed
                  ? 'Try loading more again'
                  : 'Load more Cruxes'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** The page when there is nothing to show: a missing author, or no answer. */
function Missing({ title, body }: { title: string; body: string }) {
  return <DeadEnd title={title} body={body} />;
}
