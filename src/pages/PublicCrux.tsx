import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicApi } from '@/api';
import type { Crux, Attachment } from '@/api/types';
import { applyPalette, resetPalette } from '@/lib/palette';
import { Spinner } from '@/components/ui';
import { PublicTopBar, ArtifactRenderer } from '@/components/display';

type LoadState = 'loading' | 'ready' | 'not-found' | 'error';

export default function PublicCrux() {
  const { username: rawUsername, slug } = useParams<{ username: string; slug: string }>();

  // Route is /:username/:slug — require @ prefix for public crux URLs
  const hasAtPrefix = rawUsername?.startsWith('@') ?? false;
  const username = hasAtPrefix ? rawUsername!.slice(1) : rawUsername;

  const [crux, setCrux] = useState<Crux | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  // Fetch crux + attachments
  useEffect(() => {
    if (!username || !slug || !hasAtPrefix) {
      setState('not-found');
      return;
    }

    let cancelled = false;
    setState('loading');

    Promise.all([
      publicApi.getCruxBySlug(username, slug),
      publicApi.getAttachments(username, slug),
    ])
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

  // Apply palette from crux settings
  useEffect(() => {
    if (crux?.meta?.settings?.palette) {
      applyPalette(crux.meta.settings.palette);
    }
    return () => {
      resetPalette();
    };
  }, [crux]);

  // Set document title
  useEffect(() => {
    if (crux?.title) {
      document.title = crux.title;
    }
    return () => {
      document.title = 'Crux Garden';
    };
  }, [crux?.title]);

  if (state === 'loading') {
    return (
      <div className="relative min-h-screen flex items-center justify-center">
        <Spinner size={32} />
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
      />

      <div className="flex-1 min-h-0 relative z-10">
        <ArtifactRenderer
          attachments={attachments}
          username={username || ''}
          slug={slug || ''}
        />
      </div>
    </div>
  );
}
