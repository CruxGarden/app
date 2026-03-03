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
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="5" r="3" />
      <circle cx="12" cy="19" r="3" />
      <path d="M8.59 7.41L12 16M15.41 7.41L12 16" />
    </svg>
  );
}

function CopyIcon() {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
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

  const publicUrl =
    author && crux ? `${window.location.origin}/${author.username}/${crux.slug}` : null;

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
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">No crux loaded</p>
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
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Nothing to publish yet</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex flex-col h-full">
      <PaneHeader paneType="publish" icon={<PublishIcon />} label="Publish" />

      {isTooNarrow ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Enlarge pane to view contents</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          {/* Status card */}
          {isPublished && publishedAt ? (
            <div className="rounded-[var(--radius-sm)] border border-border bg-surface/50 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                  <span className="text-[11px] font-mono text-accent">Published</span>
                </div>
                <span className="text-[11px] font-mono text-text-muted">v{publishedVersion}</span>
              </div>
              <div className="text-[10px] font-mono text-text-muted">
                {formatDate(publishedAt)}
              </div>
              {hasUnpublishedChanges && lastEditedAt && new Date(lastEditedAt) > new Date(publishedAt) && (
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                  <span className="text-[10px] font-mono text-error">
                    Edited {formatDate(lastEditedAt)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[var(--radius-sm)] border border-border/60 border-dashed p-3">
              <p className="text-[11px] font-mono text-text-muted text-center">Not published</p>
            </div>
          )}

          {/* Action button — state-aware, no disabled green */}
          {publishing ? (
            <button
              disabled
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                'text-sm font-medium font-body',
                'bg-accent/70 text-bg cursor-wait',
              )}
            >
              <span className="inline-block w-3 h-3 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
              Publishing...
            </button>
          ) : isPublished && !hasUnpublishedChanges ? (
            <div
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                'text-sm font-medium font-body',
                'border border-accent/25 text-accent/60',
              )}
            >
              <CheckIcon size={14} />
              Up to date
            </div>
          ) : (
            <button
              onClick={handlePublish}
              className={cn(
                'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-sm)]',
                'text-sm font-medium font-body transition-all cursor-pointer',
                'bg-accent text-bg hover:brightness-110',
              )}
            >
              <PublishIcon />
              {isPublished ? 'Publish Changes' : 'Publish'}
            </button>
          )}

          {/* Public URL */}
          {isPublished && publicUrl && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
                Public URL
              </span>
              <div className="flex items-center gap-1 rounded-[var(--radius-sm)] bg-bg border border-border px-2.5 py-1.5">
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

          {/* Spacer pushes unpublish to bottom */}
          <div className="flex-1" />

          {/* Unpublish — de-emphasized */}
          {isPublished && (
            <button
              onClick={handleUnpublish}
              disabled={publishing}
              className={cn(
                'w-full py-1.5 text-center',
                'text-[11px] font-mono transition-colors cursor-pointer',
                'text-text-muted/50 hover:text-error',
                'disabled:cursor-not-allowed',
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
