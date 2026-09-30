import { useCallback, useEffect, useState } from 'react';
import PublicLoading from '@/components/display/PublicLoading';
import { PublicApiError } from '@/api/public';
import DeadEnd from '@/components/layout/DeadEnd';
import { buttonClass } from '@/components/ui/button-class';
import { Button } from '@/components/ui';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Crux, Artifact } from '@/api/types';
import { APP_NAME } from '@/lib/constants';
import { PublicTopBar, ArtifactRenderer } from '@/components/display';
import MetadataContent from '@/components/workspace/MetadataContent';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

/** A dead end still offers the way back: the author's garden, Explore, home. */
function WayBack({ username }: { username?: string }) {
  const link = buttonClass('ghost', 'sm');
  return (
    <>
      {username && (
        <Link to={`/${username}`} className={link}>
          {username.startsWith('@') ? username : `@${username}`}
        </Link>
      )}
      <Link to="/explore" className={link}>
        Explore
      </Link>
      <Link to="/" className={buttonClass('secondary', 'sm')}>
        Home
      </Link>
    </>
  );
}

export default function PublicCrux() {
  const {
    username,
    slug,
    '*': subPath,
  } = useParams<{ username: string; slug: string; '*': string }>();

  const [crux, setCrux] = useState<Crux | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [attempt, setAttempt] = useState(0);
  const [metadataOpen, setMetadataOpen] = useState(false);

  const hasMetadata = !!crux;
  const transcript = Array.isArray(crux?.meta?.messages)
    ? crux.meta.messages.filter(
        (message) =>
          message &&
          typeof message.content === 'string' &&
          ['user', 'assistant'].includes(message.role),
      )
    : [];
  const purpose =
    crux?.description ||
    (typeof crux?.meta?.summary?.purpose === 'string' ? crux.meta.summary.purpose : '');
  const [visibleMessages, setVisibleMessages] = useState(6);

  // Download function: always from API for public pages
  const downloadBlob = useCallback(
    async (artifactId: string): Promise<Blob> => {
      return publicApi.downloadArtifact(username || '', slug || '', artifactId);
    },
    [username, slug],
  );

  // Fetch crux + artifacts from API only — no local database access
  useEffect(() => {
    if (!username || !slug) {
      setState('not-found');
      return;
    }

    const controller = new AbortController();
    setState('loading');
    setCrux(null);
    setMetadataOpen(false);
    setVisibleMessages(6);
    Promise.all([
      publicApi.getCruxBySlug(username, slug, controller.signal),
      publicApi.getArtifacts(username, slug, controller.signal),
    ])
      .then(([cruxData, artifactsData]) => {
        if (controller.signal.aborted) return;
        setCrux(cruxData);
        setArtifacts(artifactsData);
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
  }, [username, slug, attempt]);

  // Set document title
  useEffect(() => {
    if (crux?.title) {
      document.title = crux.title;
    }
    return () => {
      document.title = APP_NAME;
    };
  }, [crux?.title]);

  if (state === 'loading') {
    return <PublicLoading label="Loading creation…" username={username} />;
  }

  if (state === 'not-found') {
    return (
      <DeadEnd title="Not found" body="This creation doesn't exist or is private">
        <WayBack username={username} />
      </DeadEnd>
    );
  }

  if (state === 'error') {
    return (
      <DeadEnd title="Something went wrong" body="We couldn't load this creation">
        <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
        <WayBack username={username} />
      </DeadEnd>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <PublicTopBar
        title={crux?.title}
        username={username || ''}
        hasMetadata={hasMetadata}
        metadataOpen={metadataOpen}
        onToggleMetadata={() => setMetadataOpen((v) => !v)}
      />

      <div className="flex-1 min-h-0 relative z-10 flex">
        <div className={`flex-1 min-w-0 ${metadataOpen ? 'hidden sm:block' : ''}`}>
          <ArtifactRenderer
            artifacts={artifacts}
            username={username || ''}
            slug={slug || ''}
            cruxId={crux?.id || ''}
            subPath={subPath}
            downloadBlob={downloadBlob}
          />
        </div>

        {metadataOpen && crux && (
          <aside
            aria-label="About this creation"
            className="w-full sm:w-[360px] sm:max-w-[42%] shrink-0 border-l border-border bg-bg overflow-y-auto p-4 space-y-5"
          >
            <div>
              <h1 className="text-xl font-medium text-text break-words">
                {crux.title || crux.slug}
              </h1>
              <Link to={`/${username}`} className="inline-block mt-2 text-sm text-accent">
                By @{username?.replace(/^@/, '')}
              </Link>
              {purpose && (
                <p className="mt-3 text-sm leading-relaxed text-text-muted whitespace-pre-wrap break-words">
                  {purpose}
                </p>
              )}
            </div>
            <div className="rounded-[var(--radius)] border border-border p-3">
              <p className="text-sm mb-2">Make a little place for your own idea.</p>
              <a href="/docs/start/get-started/" className={buttonClass('secondary', 'sm')}>
                Get started with Crux Garden
              </a>
            </div>
            {!!transcript.length && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">How this was made</summary>
                <p className="mt-2 text-xs text-text-muted">
                  The conversation this creator published with the project.
                </p>
                <ol className="mt-3 space-y-4">
                  {transcript.slice(0, visibleMessages).map((message, index) => (
                    <li key={index} className="text-sm">
                      <p className="font-medium text-accent mb-1">
                        {message.role === 'assistant' ? 'Collaborator' : 'Person'}
                      </p>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">
                        {message.content || 'Worked with project tools.'}
                      </p>
                    </li>
                  ))}
                </ol>
                {visibleMessages < transcript.length && (
                  <button
                    className={buttonClass('secondary', 'sm', 'mt-3')}
                    onClick={() => setVisibleMessages((count) => count + 6)}
                  >
                    Read more of the conversation
                  </button>
                )}
              </details>
            )}
            <details>
              <summary className="cursor-pointer text-sm text-text-muted">Project details</summary>
              <MetadataContent
                crux={crux}
                summary={crux.meta?.summary}
                authorName={username}
                messages={transcript}
                readOnly
                tagLink={(tag) => `/explore?tag=${encodeURIComponent(tag)}`}
              />
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}
