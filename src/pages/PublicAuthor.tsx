import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Author, Crux } from '@/api/types';
import { API_BASE_URL } from '@/api/client';
import MeshBackground from '@/components/layout/MeshBackground';
import { PublicTopBar } from '@/components/display';
import { GardenGrid } from '@/components/garden';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

const PER_PAGE = 24;

export default function PublicAuthor() {
  const { username: rawUsername } = useParams<{ username: string }>();

  const hasAtPrefix = rawUsername?.startsWith('@') ?? false;
  const username = hasAtPrefix ? rawUsername!.slice(1) : rawUsername;

  const [author, setAuthor] = useState<Author | null>(null);
  const [cruxes, setCruxes] = useState<Crux[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!username || !hasAtPrefix) {
      setState('not-found');
      return;
    }

    let cancelled = false;
    setState('loading');

    Promise.all([
      publicApi.getAuthor(username),
      publicApi.getAuthorCruxes(username, { page, perPage: PER_PAGE }),
    ])
      .then(([authorData, cruxData]) => {
        if (cancelled) return;
        setAuthor(authorData);
        setCruxes(cruxData.cruxes);
        setTotalPages(cruxData.totalPages);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.message?.includes('404')) {
          setState('not-found');
        } else {
          setState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [username, hasAtPrefix, page]);

  useEffect(() => {
    if (author?.displayName) {
      document.title = `${author.displayName} — Crux Garden`;
    }
    return () => {
      document.title = 'Crux Garden';
    };
  }, [author?.displayName]);

  const linkBuilder = useCallback(
    (crux: Crux) => `/@${username}/${crux.slug}`,
    [username],
  );

  const avatarUrl = author?.meta?.avatarUrl
    ? `${API_BASE_URL}${author.meta.avatarUrl}?v=${author.updated}`
    : null;
  const initial = author?.displayName?.charAt(0)?.toUpperCase() ?? '?';

  if (state === 'loading') {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <MeshBackground />
        <Spinner size={32} />
      </div>
    );
  }

  if (state === 'not-found') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <MeshBackground />
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
        <MeshBackground />
        <div className="relative z-10 text-center">
          <h1 className="font-display text-4xl font-bold text-text mb-2">Something went wrong</h1>
          <p className="text-text-muted">We couldn't load this profile</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <MeshBackground />
      <PublicTopBar username={username || ''} />

      <div className="relative z-10 flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {/* Author header */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className={cn(
              'w-14 h-14 rounded-full overflow-hidden flex items-center justify-center shrink-0',
              !avatarUrl && 'bg-accent-muted text-accent text-xl font-display font-bold',
            )}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text truncate">
              {author?.displayName}
            </h1>
            <p className="text-sm text-text-muted">@{username}</p>
          </div>
        </div>

        {/* Crux grid */}
        {cruxes.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-text-muted text-sm">No published cruxes yet</p>
          </div>
        ) : (
          <>
            <GardenGrid cruxes={cruxes} linkBuilder={linkBuilder} />

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Prev
                </button>
                <span className="text-xs font-mono text-text-muted">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1.5 text-xs font-mono text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
