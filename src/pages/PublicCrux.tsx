import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Crux, Attachment } from '@/api/types';
import { APP_NAME } from '@/lib/constants';
import { Spinner } from '@/components/ui';
import { PublicTopBar, ArtifactRenderer } from '@/components/display';
import MetadataContent from '@/components/workspace/MetadataContent';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

export default function PublicCrux() {
  const { username, slug } = useParams<{ username: string; slug: string }>();

  const [crux, setCrux] = useState<Crux | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [metadataOpen, setMetadataOpen] = useState(false);

  const hasMetadata = !!crux;

  // Fetch crux + attachments
  useEffect(() => {
    if (!username || !slug) {
      setState('not-found');
      return;
    }

    let cancelled = false;
    setState('loading');

    Promise.all([publicApi.getCruxBySlug(username, slug), publicApi.getAttachments(username, slug)])
      .then(([cruxData, attachmentData]) => {
        if (cancelled) return;
        setCrux(cruxData);
        setAttachments(attachmentData);
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
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 px-5 py-3 rounded-lg bg-surface-solid/80 backdrop-blur-sm border border-border text-text-muted text-sm">
          <Spinner size={16} />
          Loading...
        </div>
      </div>
    );
  }

  if (state === 'not-found') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="relative z-10 text-center">
          <h1 className="font-display text-4xl font-bold text-text mb-2">Not found</h1>
          <p className="text-text-muted">This creation doesn't exist or is private</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center px-4">
        <div className="relative z-10 text-center">
          <h1 className="font-display text-4xl font-bold text-text mb-2">Something went wrong</h1>
          <p className="text-text-muted">We couldn't load this creation</p>
        </div>
      </div>
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
          <ArtifactRenderer attachments={attachments} username={username || ''} slug={slug || ''} />
        </div>

        {metadataOpen && crux && (
          <div className="w-full sm:w-[300px] sm:max-w-[40%] shrink-0 border-l border-border bg-bg overflow-hidden flex flex-col">
            <div className="flex items-center px-3 h-8 border-b border-border shrink-0">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Metadata
              </span>
            </div>
            <MetadataContent
              crux={crux}
              summary={crux.meta?.summary}
              authorName={username}
              messages={crux.meta?.messages}
              readOnly
            />
          </div>
        )}
      </div>
    </div>
  );
}
