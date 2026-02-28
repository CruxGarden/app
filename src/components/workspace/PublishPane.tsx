import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCruxStore } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import CreateAuthorModal from '@/components/auth/CreateAuthorModal';
import PaneHeader from './PaneHeader';

function PublishIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="5" r="3" />
      <circle cx="12" cy="19" r="3" />
      <path d="M8.59 7.41L12 16M15.41 7.41L12 16" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const REDIRECT_KEY = 'cruxgarden:publishRedirect';

export default function PublishPane() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const author = useAuthStore((s) => s.author);
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const publishCrux = useCruxStore((s) => s.publishCrux);
  const unpublishCrux = useCruxStore((s) => s.unpublishCrux);
  const hasUnpublishedChanges = useCruxStore((s) => s.hasUnpublishedChanges);

  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  const { ref, isTooNarrow } = usePaneWidth(270);

  const isPublished = crux?.meta?.publishedAt != null;

  const lastEditedAt = useMemo(() => {
    if (artifacts.length === 0) return null;
    const latest = artifacts.reduce((max, a) =>
      new Date(a.updated).getTime() > new Date(max.updated).getTime() ? a : max,
    );
    return latest.updated;
  }, [artifacts]);

  const publicUrl = author && crux
    ? `${window.location.origin}/@${author.username}/${crux.slug}`
    : null;

  const doPublish = useCallback(async () => {
    if (!crux) return;
    const currentAuthor = useAuthStore.getState().author;
    if (!currentAuthor) return;

    setPublishing(true);
    try {
      await publishCrux();
    } finally {
      setPublishing(false);
    }
  }, [crux, publishCrux]);

  const handlePublish = useCallback(() => {
    if (!isAuthenticated) {
      sessionStorage.setItem(REDIRECT_KEY, window.location.pathname);
      navigate('/login');
      return;
    }
    if (!author) {
      setShowAuthorModal(true);
      return;
    }
    doPublish();
  }, [isAuthenticated, author, doPublish, navigate]);

  const handleAuthorCreated = useCallback(() => {
    setShowAuthorModal(false);
    doPublish();
  }, [doPublish]);

  const handleUnpublish = useCallback(async () => {
    setPublishing(true);
    try {
      await unpublishCrux();
    } finally {
      setPublishing(false);
    }
  }, [unpublishCrux]);

  const handleCopyUrl = useCallback(() => {
    if (!publicUrl) return;
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicUrl]);

  if (!crux) {
    return (
      <div ref={ref} className="flex flex-col h-full">
        <PaneHeader paneType="publish" icon={<PublishIcon />} label="Publish" />
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">No crux loaded</p>
        </div>
      </div>
    );
  }

  const publishedVersion = crux.meta?.publishedVersion as number | undefined;
  const publishedAt = crux.meta?.publishedAt as string | undefined;

  if (artifacts.length === 0 && !isPublished) {
    return (
      <div ref={ref} className="flex flex-col h-full">
        <PaneHeader paneType="publish" icon={<PublishIcon />} label="Publish" />
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">Nothing to publish yet</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex flex-col h-full">
      <PaneHeader paneType="publish" icon={<PublishIcon />} label="Publish" />

      {isTooNarrow ? (
        <div className="text-text-muted p-4">
          <p className="text-xs text-center">Enlarge pane to view contents</p>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-4">
        {/* Version info */}
        {isPublished && publishedAt && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Version</span>
            <div className="text-[11px] font-mono text-text-muted space-y-1">
              <div className="flex justify-between">
                <span>Published</span>
                <span className="text-text">v{publishedVersion}</span>
              </div>
              <div className="flex justify-between">
                <span>Published at</span>
                <span className="text-text">{formatDate(publishedAt)}</span>
              </div>
              {hasUnpublishedChanges && lastEditedAt && (
                <div className="flex justify-between text-yellow-400 mt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
                    <span>Last edited</span>
                  </div>
                  <span>{formatDate(lastEditedAt)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Publish / Republish action */}
        <button
          onClick={handlePublish}
          disabled={publishing || (isPublished && !hasUnpublishedChanges)}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
            'text-sm font-medium font-body transition-all cursor-pointer',
            'bg-accent text-bg hover:brightness-110',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <PublishIcon />
          {publishing
            ? 'Publishing...'
            : isPublished
              ? hasUnpublishedChanges
                ? 'Publish Changes'
                : 'Published'
              : 'Publish'}
        </button>

        {/* Published URL */}
        {isPublished && publicUrl && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">Public URL</span>
            <div className="flex items-center gap-1.5 bg-bg rounded-[var(--radius-sm)] p-2 border border-border">
              <span className="text-[11px] font-mono text-accent truncate flex-1">
                {publicUrl}
              </span>
              <button
                onClick={handleCopyUrl}
                className="shrink-0 p-1 text-text-muted hover:text-text transition-colors cursor-pointer"
                title={copied ? 'Copied!' : 'Copy URL'}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1 text-text-muted hover:text-text transition-colors"
                title="Open in new tab"
              >
                <ExternalLinkIcon />
              </a>
            </div>
          </div>
        )}

        {/* Unpublish action */}
        {isPublished && (
          <button
            onClick={handleUnpublish}
            disabled={publishing}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-4 py-2 rounded-[var(--radius-sm)]',
              'text-xs font-mono transition-colors cursor-pointer',
              'text-text-muted hover:text-error border border-border hover:border-error/40',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            Unpublish
          </button>
        )}
      </div>
      )}

      <CreateAuthorModal
        open={showAuthorModal}
        onClose={() => setShowAuthorModal(false)}
        onCreated={handleAuthorCreated}
      />
    </div>
  );
}
