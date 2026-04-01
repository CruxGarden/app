import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Author, Crux } from '@/api/types';
import { resolveAvatarUrl } from '@/stores/authStore';
import { PublicTopBar } from '@/components/display';
import { GardenGrid, GardenSearch } from '@/components/garden';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { APP_NAME } from '@/lib/constants';


type LoadState = 'loading' | 'ready' | 'not-found' | 'error';
type SortField = 'created' | 'updated';

async function loadAuthorData(username: string): Promise<{ author: Author; cruxes: Crux[] }> {
  const [author, cruxData] = await Promise.all([
    publicApi.getAuthor(username),
    publicApi.getAuthorCruxes(username, { page: 1, perPage: 1000 }),
  ]);
  return { author, cruxes: cruxData.cruxes };
}

export default function PublicGarden() {
  const { username } = useParams<{ username: string }>();

  const [author, setAuthor] = useState<Author | null>(null);
  const [cruxes, setCruxes] = useState<Crux[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('created');

  useEffect(() => {
    if (!username) {
      setState('not-found');
      return;
    }

    let cancelled = false;

    // Load from API only — no local database access on public pages
    loadAuthorData(username)
      .then((data) => {
        if (cancelled) return;
        setAuthor(data.author);
        setCruxes(data.cruxes);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.message?.includes('404') || err.message?.includes('not found')) {
          setState('not-found');
        } else {
          setState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [username]);

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
    return <div className="min-h-screen bg-bg" />;
  }

  if (state === 'not-found') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="relative z-10 text-center">
          <h1 className="font-display text-4xl font-bold text-text mb-2">Not found</h1>
          <p className="text-text-muted">This author doesn't exist</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="relative z-10 text-center">
          <h1 className="font-display text-4xl font-bold text-text mb-2">Something went wrong</h1>
          <p className="text-text-muted">We couldn't load this profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PublicTopBar username={username || ''} />

      <div className="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Header + Search panel */}
        <div className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-[var(--radius)] overflow-hidden flex items-center justify-center shrink-0 ring-1 ring-text-muted/20 bg-surface"
            >
              {avatarUrl && (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              )}
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
              <GardenSearch value={search} onChange={setSearch} />
            </div>
            <div className="flex items-center gap-1 text-xs font-mono text-text-muted shrink-0">
              <span>Sort by</span>
              <button
                onClick={() => setSortBy('created')}
                className={cn(
                  'px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                  sortBy === 'created' ? 'text-text bg-surface' : 'hover:text-text',
                )}
              >
                Created
              </button>
              <button
                onClick={() => setSortBy('updated')}
                className={cn(
                  'px-2 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer',
                  sortBy === 'updated' ? 'text-text bg-surface' : 'hover:text-text',
                )}
              >
                Updated
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {filteredCruxes.length === 0 ? (
          <div className="bg-panel border border-border rounded-[var(--radius)] flex flex-col items-center py-10">
            <p className="text-text-muted text-sm mb-3">
              {search ? 'No cruxes match your search' : 'No published cruxes yet'}
            </p>
            {search && (
              <Button variant="ghost" onClick={() => setSearch('')}>
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <GardenGrid cruxes={filteredCruxes} linkBuilder={linkBuilder} sortBy={sortBy} hideMenu />
        )}
      </div>
    </div>
  );
}
