import PublishedPackage from '@/components/explore/PublishedPackage';
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
import PublicCruxAbout from '@/components/public/PublicCruxAbout';
import { publicConversationState, publicTranscript } from '@/services/shared-conversation';
import { canonicalUrl, usePageMeta } from '@/hooks/usePageMeta';
import { metaDescription } from '@/lib/page-meta';
import { publicCoverUrl } from '@/lib/public-cover';

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
        Explore Home
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
  const transcript = publicTranscript(crux);
  const purpose =
    crux?.description ||
    (typeof crux?.meta?.summary?.purpose === 'string' ? crux.meta.summary.purpose : '');

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

  // Title, description and link-preview tags for this creation
  const handle = (username || '').replace(/^@/, '');
  usePageMeta(
    crux && state === 'ready'
      ? {
          title: `${crux.title || crux.slug} — ${APP_NAME}`,
          description:
            metaDescription(purpose) ?? `A creation by @${handle} published with ${APP_NAME}.`,
          canonical: canonicalUrl(`/${handle}/${crux.slug}`),
          // Tools and Moods publish a package, not a site, so they have no cover file.
          image: crux.kind === 'tool' || crux.kind === 'mood' ? undefined : publicCoverUrl(crux.id),
        }
      : null,
  );

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
        reportCruxId={crux?.id}
        hasMetadata={hasMetadata}
        metadataOpen={metadataOpen}
        onToggleMetadata={() => setMetadataOpen((v) => !v)}
      />

      <div className="flex-1 min-h-0 relative z-10 flex">
        <div className={`flex-1 min-w-0 ${metadataOpen ? 'hidden sm:block' : ''}`}>
          {crux && (crux.kind === 'tool' || crux.kind === 'mood') ? (
            <PublishedPackage crux={crux} artifacts={artifacts} username={username || ''} />
          ) : (
            <ArtifactRenderer
              artifacts={artifacts}
              username={username || ''}
              slug={slug || ''}
              cruxId={crux?.id || ''}
              subPath={subPath}
              downloadBlob={downloadBlob}
            />
          )}
        </div>

        {metadataOpen && crux && (
          <PublicCruxAbout
            crux={crux}
            username={username || ''}
            transcript={transcript}
            conversation={publicConversationState(crux.meta, transcript.length)}
          />
        )}
      </div>
    </div>
  );
}
