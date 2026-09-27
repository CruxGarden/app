import { useCallback, useEffect, useState } from 'react';
import DeadEnd from '@/components/layout/DeadEnd';
import { buttonClass } from '@/components/ui/button-class';
import { SectionLabel } from '@/components/ui';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Crux, Artifact } from '@/api/types';
import { APP_NAME } from '@/lib/constants';
import { PublicTopBar, ArtifactRenderer } from '@/components/display';
import { useStoreApiProxy } from '@/hooks/useStoreApiProxy';
import { publishOriginFor } from '@/lib/public-url';
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
  const [metadataOpen, setMetadataOpen] = useState(false);

  // Proxy store postMessages to the API when running locally
  // (browser blocks published iframe from fetching localhost directly)
  // Store calls from the published page are always proxied through this
  // window so the visitor's credentials never reach third-party crux code.
  useStoreApiProxy(crux?.id ?? null, crux ? publishOriginFor(crux.id) : null);

  const hasMetadata = !!crux;

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

    let cancelled = false;
    setState('loading');
    Promise.all([publicApi.getCruxBySlug(username, slug), publicApi.getArtifacts(username, slug)])
      .then(([cruxData, artifactsData]) => {
        if (cancelled) return;
        setCrux(cruxData);
        setArtifacts(artifactsData);
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
  }, [username, slug]);

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
    return <div className="min-h-screen bg-bg" />;
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
          <div className="w-full sm:w-[300px] sm:max-w-[40%] shrink-0 border-l border-border bg-bg overflow-hidden flex flex-col">
            <div className="flex items-center px-3 h-8 border-b border-border shrink-0">
              <SectionLabel tone="muted">Metadata</SectionLabel>
            </div>
            <MetadataContent
              crux={crux}
              summary={crux.meta?.summary}
              authorName={username}
              messages={crux.meta?.messages}
              readOnly
              tagLink={(tag) => `/explore?tag=${encodeURIComponent(tag)}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
