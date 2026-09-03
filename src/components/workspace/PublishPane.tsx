import { useState, useMemo, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useCruxStore, selectHasUnpublishedChanges } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { publicCruxUrl } from '@/lib/public-url';
import { type PublishPhase } from '@/services/publish';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import CreateAuthorModal from '@/components/auth/CreateAuthorModal';
import ConnectAccount from '@/components/auth/ConnectAccount';
import { PaneEmpty, PaneSection, PaneAction } from './pane-ui';
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

/** What the spinner says while a publish runs — a site build is not instant. */
const PHASE_LABELS: Record<PublishPhase, string> = {
  sync: 'Syncing...',
  build: 'Building site...',
  collect: 'Collecting files...',
  upload: 'Uploading...',
  finalize: 'Finishing...',
  tags: 'Finishing...',
};

export default function PublishPane() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const author = useAppStore((s) => s.author);
  const crux = useCruxStore((s) => s.crux);
  const artifacts = useCruxStore((s) => s.artifacts);
  const publishCrux = useCruxStore((s) => s.publishCrux);
  const unpublishCrux = useCruxStore((s) => s.unpublishCrux);
  const hasUnpublishedChanges = useCruxStore(selectHasUnpublishedChanges);

  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const phase = useCruxStore((s) => s.publishPhase);
  const failure = useCruxStore((s) => s.publishFailure);

  const { ref, isTooNarrow } = usePaneWidth(270);

  const updateCrux = useCruxStore((s) => s.updateCrux);
  const isPublished = crux?.meta?.publishedAt != null;

  const lastEditedAt = useMemo(() => {
    if (artifacts.length === 0) return null;
    const latest = artifacts.reduce((max, a) =>
      new Date(a.updated).getTime() > new Date(max.updated).getTime() ? a : max,
    );
    return latest.updated;
  }, [artifacts]);

  const publicUrl = author && crux ? publicCruxUrl(author.username, crux.slug) : null;

  const doPublish = useCallback(async () => {
    if (!crux) return;
    const currentAuthor = useAppStore.getState().author;
    if (!currentAuthor) return;

    setPublishing(true);
    try {
      await publishCrux(); // records its own outcome in the store
    } finally {
      setPublishing(false);
    }
  }, [crux, publishCrux]);

  const handlePublish = useCallback(() => {
    if (!isAuthenticated) {
      setShowConnect(true);
      return;
    }
    if (!author) {
      setShowAuthorModal(true);
      return;
    }
    doPublish();
  }, [isAuthenticated, author, doPublish]);

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
        <PaneEmpty title="No crux loaded" />
      </div>
    );
  }

  const publishedVersion = crux.meta?.publishedVersion as number | undefined;
  const publishedAt = crux.meta?.publishedAt as string | undefined;

  if (artifacts.length === 0 && !isPublished) {
    return (
      <div ref={ref} className="flex flex-col h-full">
        <PaneEmpty
          icon={<PublishIcon />}
          title="Nothing to share yet"
          description="Add a file or ask the AI to make something. Sharing puts it live on crux.garden."
        />
      </div>
    );
  }

  return (
    <div ref={ref} className="flex flex-col h-full">
      {isTooNarrow ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Enlarge pane to view contents</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          {/* Status card */}
          {isPublished && publishedAt ? (
            <PaneSection label="Status" aside={`v${publishedVersion}`}>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="text-[11px] font-mono text-accent">Shared</span>
                <span className="text-[10px] font-mono text-text-muted ml-auto">
                  {formatDateTime(publishedAt)}
                </span>
              </div>
              {hasUnpublishedChanges &&
                lastEditedAt &&
                new Date(lastEditedAt) > new Date(publishedAt) && (
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                    <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                    <span className="text-[10px] font-mono text-error">
                      Edited {formatDateTime(lastEditedAt)}
                    </span>
                  </div>
                )}
            </PaneSection>
          ) : (
            <PaneSection label="Status" tone="dashed">
              <p className="text-[11px] text-text-muted">
                Not shared yet. Sharing publishes this crux at its own address, with its
                conversation open to visitors.
              </p>
            </PaneSection>
          )}

          {/* Discoverable toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <button
              onClick={() => updateCrux({ discoverable: !crux.discoverable })}
              className={cn(
                'relative w-7 h-4 rounded-full transition-colors shrink-0 cursor-pointer',
                crux.discoverable ? 'bg-accent' : 'bg-border',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                  crux.discoverable && 'translate-x-3',
                )}
              />
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-body text-text">Discoverable</span>
              <span className="text-[10px] text-text-muted">
                {crux.discoverable
                  ? 'Visible in search on crux.garden'
                  : 'Only accessible by direct link'}
              </span>
            </div>
          </label>

          {/* Action button — state-aware, no disabled green */}
          {publishing ? (
            <PaneAction busy={PHASE_LABELS[phase ?? 'sync']}>Share</PaneAction>
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
          ) : showConnect ? (
            <div className="rounded-[var(--radius-sm)] border border-border bg-surface/50 p-3">
              <ConnectAccount
                compact
                description="Connect your account to share this crux."
                onConnected={() => {
                  setShowConnect(false);
                  doPublish();
                }}
              />
            </div>
          ) : (
            <PaneAction onClick={handlePublish} icon={<PublishIcon />}>
              {isPublished ? 'Update' : 'Share'}
            </PaneAction>
          )}

          {/* Failure — a silent no-op is indistinguishable from success here */}
          {failure && !publishing && (
            <div className="rounded-[var(--radius-sm)] border border-error/40 bg-error/5 p-3">
              <p role="alert" className="text-xs font-body text-error">
                {failure.message}
              </p>
              {failure.log && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-text-muted">
                  {failure.log.slice(-2000)}
                </pre>
              )}
            </div>
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
              Unshare
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
