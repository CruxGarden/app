import { useState, useMemo, useCallback, useEffect } from 'react';
import { isEmbeddedApp, isLocalCreationTool } from '@/services/embedded-app';
import { Capability, can } from '@/lib/platform';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useCruxStore, useCruxStoreApi, selectHasUnpublishedChanges } from '@/stores/cruxStore';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { publicCruxUrl, openGardenPage } from '@/lib/public-url';
import { type PublishPhase } from '@/services/publish';
import { usePaneWidth } from '@/hooks/usePaneWidth';
import CreateAuthorModal from '@/components/auth/CreateAuthorModal';
import ConnectAccount from '@/components/auth/ConnectAccount';
import { Toggle } from '@/components/ui';
import { PaneEmpty, PaneSection, PaneAction, PaneHint, PaneNote } from './pane-ui';
import UsageSection from './UsageSection';
import { confirmDialog, choiceDialog } from '@/stores/dialogStore';
import { backupCrux, backupOf, snapshotsBehind } from '@/services/backup';
import { getSetting, setSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import * as domainsApi from '@/api/domains';
import * as cruxesApi from '@/api/cruxes';
import * as liveStore from '@/api/store';
import CustomDomainSection from './CustomDomainSection';
import { CheckIcon, CopyIcon, ExternalLinkIcon, PowerIcon, ShareIcon } from '@/components/ui/icons';

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

  // Drift (RESILIENCE-PLAN §3, scenarios 4 and 5): local meta says "published",
  // but the account may say otherwise — unpublished elsewhere, or published
  // again from another machine. Ask once per open; the pane says what it found.
  type Remote = { state: 'gone' } | { state: 'ahead'; version: number } | { state: 'same' };
  const [remote, setRemote] = useState<Remote | null>(null);
  useEffect(() => {
    setRemote(null);
    if (!crux?.id || !isPublished || !isAuthenticated) return;
    let cancelled = false;
    const localVersion = Number(crux.meta?.publishedVersion ?? 0);
    cruxesApi
      .get(crux.id)
      .then((r) => {
        if (cancelled) return;
        const v = Number(r.meta?.publishedVersion ?? 0);
        if (!r.meta?.publishedAt) setRemote({ state: 'gone' });
        else if (v > localVersion) setRemote({ state: 'ahead', version: v });
        else setRemote({ state: 'same' });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) setRemote({ state: 'gone' });
        // any other failure: say nothing rather than something wrong
      });
    return () => {
      cancelled = true;
    };
    // publishedVersion changes after a publish here; re-check then
  }, [crux?.id, crux?.meta?.publishedVersion, isPublished, isAuthenticated]);

  // Backups (RESILIENCE-PLAN §2b): a published site is not a backup. A crux
  // that has never been backed up asks before it is shared; "Always back up
  // when I share" turns the question into a habit. Returns false to stop.
  const growthCount = useCruxStore((s) => s.growthCount);
  const store = useCruxStoreApi();
  const [backingUp, setBackingUp] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const runBackup = useCallback(async (): Promise<boolean> => {
    setBackingUp(true);
    setBackupError(null);
    try {
      await backupCrux(store);
      return true;
    } catch (err) {
      setBackupError(
        `Backup failed — ${err instanceof Error ? err.message : 'could not reach crux.garden'}. The share went through; try Back up now.`,
      );
      return false;
    } finally {
      setBackingUp(false);
    }
  }, [store]);
  /**
   * What the share asks about backups: 'skip' (share only), 'backup' (share,
   * then back up so the archive carries the publish facts), or null (stop).
   */
  const askAboutBackup = useCallback(async (): Promise<'skip' | 'backup' | null> => {
    const current = store.getState().crux;
    if (!current) return null;
    const always =
      getSetting(SettingsKey.BackupOnShare) === 'true' ||
      getSetting(SettingsKey.AutoBackup) === 'true';
    if (always) return 'backup';
    if (backupOf(current)) return 'skip'; // backed up before; the pane shows how far behind
    const r = await choiceDialog({
      title: 'No backup on crux.garden',
      message:
        'A published site is not a backup — it holds what visitors see, not this crux’s sources and history. If this machine is lost, they go with it. Back this crux up as well?',
      choices: [
        { id: 'skip', label: 'Share without a backup', variant: 'ghost' },
        { id: 'backup', label: 'Back up and share' },
      ],
      checkbox: { label: 'Always back up when I share' },
    });
    if (r.choice === null) return null;
    if (r.checked) setSetting(SettingsKey.BackupOnShare, 'true');
    return r.choice === 'backup' ? 'backup' : 'skip';
  }, [store]);

  const doPublish = useCallback(async () => {
    if (!crux) return;
    const currentAuthor = useAppStore.getState().author;
    if (!currentAuthor) return;

    const backup = await askAboutBackup();
    if (backup === null) return;
    setPublishing(true);
    let ok: boolean;
    try {
      ok = await publishCrux(); // records its own outcome in the store
    } finally {
      setPublishing(false);
    }
    // After the publish, so the archive carries publishedAt and the fingerprints;
    // and only when the share itself worked.
    if (ok && backup === 'backup') {
      const behind = snapshotsBehind(store.getState().crux, store.getState().growthCount);
      if (behind !== 0 || !backupOf(store.getState().crux)) await runBackup();
    }
  }, [crux, publishCrux, askAboutBackup, runBackup, store]);

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

  const [unshareError, setUnshareError] = useState<string | null>(null);
  const handleUnpublish = useCallback(async () => {
    // Say what goes with it before it goes: custom domains stop serving and the
    // live Crux Store is deleted. Both are looked up now so the message is exact.
    const [domains, rows] = await Promise.all([
      crux?.id ? domainsApi.list(crux.id).catch(() => []) : [],
      crux?.id ? liveStore.listLive(crux.id).catch(() => []) : [],
    ]);
    const parts = ['Takes the site offline. Your files and history stay here.'];
    if (domains.length)
      parts.push(
        `${domains.map((d) => d.hostname).join(', ')} will stop serving; reconnect later and the same records verify.`,
      );
    if (rows.length) {
      const keys = new Set(rows.map((r) => r.key)).size;
      parts.push(
        `Everything visitors wrote to the Crux Store is deleted — ${keys} key${keys === 1 ? '' : 's'}, ${rows.length} row${rows.length === 1 ? '' : 's'}. Export it from the Store pane first if you want to keep it.`,
      );
    }
    if (
      !(await confirmDialog({
        title: 'Unshare this crux',
        message: parts.join(' '),
        confirmLabel: 'Unshare',
        danger: true,
      }))
    )
      return;
    setPublishing(true);
    setUnshareError(null);
    try {
      await unpublishCrux();
    } catch (err) {
      // A swallowed failure here reads as "the button does nothing".
      setUnshareError(err instanceof Error ? err.message : 'Unshare failed');
    } finally {
      setPublishing(false);
    }
  }, [unpublishCrux, crux?.id]);

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

  if (isLocalCreationTool(crux))
    return (
      <div ref={ref} className="flex flex-col h-full">
        <PaneEmpty
          title="A local creation tool"
          description="Use and save this tool in Garden. Website sharing isn't available for this Crux yet."
        />
      </div>
    );

  const publishedVersion = crux.meta?.publishedVersion as number | undefined;
  const publishedAt = crux.meta?.publishedAt as string | undefined;

  if (artifacts.length === 0 && !isPublished) {
    return (
      <div ref={ref} className="flex flex-col h-full">
        <PaneEmpty
          icon={<ShareIcon size={14} />}
          title="Nothing to share yet"
          description="Add a file or ask the AI to make something. Sharing puts it live on crux.garden."
        />
      </div>
    );
  }

  const needsAction = !isPublished || hasUnpublishedChanges || remote?.state === 'gone';
  const editedAfterPublish =
    hasUnpublishedChanges &&
    lastEditedAt &&
    publishedAt &&
    new Date(lastEditedAt) > new Date(publishedAt);

  return (
    <div ref={ref} className="flex flex-col h-full">
      {isTooNarrow ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-text-muted">Enlarge pane to view contents</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3 flex flex-col gap-3">
          {/* Status */}
          {isPublished && publishedAt ? (
            <PaneSection label="Status" aside={`v${publishedVersion}`}>
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    hasUnpublishedChanges ? 'bg-warning' : 'bg-accent',
                  )}
                />
                <span className="text-xs font-body text-text">Shared</span>
                <span
                  className={cn(
                    'ml-auto text-2xs font-mono',
                    hasUnpublishedChanges ? 'text-warning-text' : 'text-accent/80',
                  )}
                >
                  {hasUnpublishedChanges ? 'Changes to share' : 'Up to date'}
                </span>
              </div>
              <div className="mt-1.5 flex flex-col gap-0.5 text-2xs font-mono text-text-muted">
                <span>Published {formatDateTime(publishedAt)}</span>
                {editedAfterPublish && lastEditedAt && (
                  <span className="text-warning-text">Edited {formatDateTime(lastEditedAt)}</span>
                )}
              </div>
              {remote?.state === 'gone' && (
                <div className="mt-2" data-testid="publish-drift">
                  <PaneNote tone="error" className="text-left whitespace-normal">
                    No longer published — it was taken offline from elsewhere. Share again to put it
                    back.
                  </PaneNote>
                </div>
              )}
              {remote?.state === 'ahead' && (
                <div className="mt-2" data-testid="publish-drift">
                  <PaneNote tone="muted" className="text-left whitespace-normal">
                    Published elsewhere as v{remote.version}; this machine has v{publishedVersion}.
                    Sharing from here replaces it.
                  </PaneNote>
                </div>
              )}
            </PaneSection>
          ) : (
            <PaneSection label="Status" tone="dashed">
              <p className="text-xxs text-text-muted">
                {isEmbeddedApp(crux)
                  ? 'Not shared yet. Share selected content as a read-only website at its own address. Private content and Collaboration stay here.'
                  : 'Not shared yet. Sharing publishes this crux at its own address, with its conversation open to visitors.'}
              </p>
            </PaneSection>
          )}

          {/* Action — only when there is something to do; never a disabled green */}
          {backingUp ? (
            <PaneAction busy="Backing up...">Share</PaneAction>
          ) : publishing ? (
            <PaneAction busy={PHASE_LABELS[phase ?? 'sync']}>Share</PaneAction>
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
          ) : needsAction ? (
            <PaneAction onClick={handlePublish} icon={<ShareIcon size={14} />}>
              {isEmbeddedApp(crux)
                ? isPublished
                  ? 'Update shared content'
                  : 'Share selected content'
                : remote?.state === 'gone'
                  ? 'Share again'
                  : isPublished
                    ? 'Update'
                    : 'Share'}
            </PaneAction>
          ) : null}

          {/* Failure — a silent no-op is indistinguishable from success here */}
          {backupError && <PaneNote tone="error">{backupError}</PaneNote>}
          {/* Backup standing (RESILIENCE-PLAN §2b): a published site is not a backup */}
          {isPublished &&
            !backingUp &&
            (() => {
              const record = backupOf(crux);
              const behind = snapshotsBehind(crux, growthCount);
              if (!record)
                return (
                  <div data-testid="backup-standing">
                    <PaneNote tone="muted">
                      No backup on crux.garden ·{' '}
                      <button
                        type="button"
                        onClick={() => void runBackup()}
                        className="text-accent hover:underline cursor-pointer"
                      >
                        Back up now
                      </button>
                    </PaneNote>
                  </div>
                );
              if (behind && behind > 0)
                return (
                  <div data-testid="backup-standing">
                    <PaneNote tone="muted">
                      Backup is {behind} snapshot{behind === 1 ? '' : 's'} behind ·{' '}
                      <button
                        type="button"
                        onClick={() => void runBackup()}
                        className="text-accent hover:underline cursor-pointer"
                      >
                        Back up now
                      </button>
                    </PaneNote>
                  </div>
                );
              return null;
            })()}

          {failure && !publishing && (
            <div className="rounded-[var(--radius-sm)] border border-error/40 bg-error/5 p-3">
              <p role="alert" className="text-xs font-body text-error">
                {failure.message}
              </p>
              {failure.log && (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xxs leading-relaxed text-text-muted">
                  {failure.log.slice(-2000)}
                </pre>
              )}
            </div>
          )}

          {/* Public address */}
          {isPublished && publicUrl && (
            <PaneSection label="Public address">
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  // Desktop: the shell denies new windows — hand the URL to the system
                  // browser ourselves instead of trusting the popup path.
                  if (can(Capability.DesktopChrome)) {
                    e.preventDefault();
                    void openGardenPage(publicUrl);
                  }
                }}
                className="block text-xxs font-mono text-accent truncate leading-relaxed hover:underline"
              >
                {publicUrl}
              </a>
              <div className="flex gap-1.5 mt-2.5">
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-[var(--radius-sm)]',
                    'text-xxs font-body border border-border bg-surface text-text',
                    'hover:border-accent hover:text-accent transition-colors cursor-pointer',
                  )}
                >
                  {copied ? <CheckIcon /> : <CopyIcon size={12} />}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // Desktop: the shell denies new windows — hand the URL to the system
                    // browser ourselves instead of trusting the popup path.
                    if (can(Capability.DesktopChrome)) {
                      e.preventDefault();
                      void openGardenPage(publicUrl);
                    }
                  }}
                  className={cn(
                    'flex-1 inline-flex items-center justify-center gap-1.5 h-7 rounded-[var(--radius-sm)]',
                    'text-xxs font-body border border-border bg-surface text-text',
                    'hover:border-accent hover:text-accent transition-colors',
                  )}
                >
                  <ExternalLinkIcon />
                  Open
                </a>
              </div>
            </PaneSection>
          )}

          {/* Usage + custom domain — for a published crux with a connected account */}
          {isPublished && isAuthenticated && (
            <>
              <UsageSection cruxId={crux.id} refreshKey={publishedVersion} />
              <CustomDomainSection cruxId={crux.id} />
            </>
          )}

          {/* Visibility */}
          <PaneSection label="Visibility">
            <div className="flex flex-col gap-0.5">
              <Toggle
                checked={!!crux.discoverable}
                onChange={(on) => updateCrux({ discoverable: on })}
                label="Discoverable"
              />
              <span className="text-xxs text-text-muted">
                {crux.discoverable
                  ? 'Listed in search on crux.garden'
                  : 'Only people with the link can find it'}
              </span>
            </div>
          </PaneSection>

          <div className="flex-1" />

          {/* Unshare — clearly a button, but not competing with Share */}
          {isPublished && (
            <div className="border-t border-border/60 pt-3 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={publishing}
                className={cn(
                  'w-full flex items-center justify-center gap-2 h-8 rounded-[var(--radius-sm)]',
                  'text-xs font-body border border-border bg-surface text-text-muted',
                  'hover:border-error hover:text-error transition-colors cursor-pointer',
                  'disabled:cursor-not-allowed',
                )}
              >
                <PowerIcon size={13} />
                Unshare
              </button>
              <PaneHint>Takes this crux offline. Your files and history stay here.</PaneHint>
              {unshareError && <PaneNote tone="error">{unshareError}</PaneNote>}
            </div>
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
