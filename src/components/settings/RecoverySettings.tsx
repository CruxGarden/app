import { formatBytes } from '@/lib/format';
import { useState } from 'react';
import type { RecoveryOverview, RecoveryOperation } from '@/lib/platform';
import { Button } from '@/components/ui';
import ActionError from '@/components/ui/ActionError';
import { actionFailure, type ActionFailure } from '@/lib/action-failure';
import { shortenHomePath } from '@/services/desktop';

/** Scanning is explicit: opening Settings never walks every Project Folder. */
export default function RecoverySettings() {
  const [overview, setOverview] = useState<RecoveryOverview | null>(null);
  const [error, setError] = useState<ActionFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(20);
  const bridge = window.electronAPI?.project;
  if (!bridge?.recoveryOverview) return null;
  const review = async () => {
    setBusy(true);
    setError(null);
    setStatus('');
    try {
      setOverview(await bridge.recoveryOverview!());
    } catch (error) {
      setError(
        actionFailure(
          error,
          'Could not review recovery storage. Check that your Project Folders are available, then refresh.',
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const trash = async (operation: RecoveryOperation) => {
    setBusy(true);
    setError(null);
    setStatus('');
    try {
      if (await bridge.trashRecovery!(operation))
        setStatus('Retained files moved to Trash. Current Artifacts and Growth are unchanged.');
    } catch (error) {
      setError(
        actionFailure(
          error,
          'Recovery cleanup could not finish. Some files may already be in Trash. Refresh and review what remains before retrying.',
        ),
      );
    } finally {
      try {
        setOverview(await bridge.recoveryOverview!());
      } catch {
        setOverview(null);
      }
      setBusy(false);
    }
  };
  const items =
    overview?.operations
      .filter((item) => item.hasPayload || item.reason)
      .sort((a, b) => (b.completedAt ?? Infinity) - (a.completedAt ?? Infinity)) ?? [];
  return (
    <section aria-label="Recovery storage" className="mb-6 space-y-3">
      <div>
        <h3 className="font-display text-sm font-medium text-text mb-2">Recovery storage</h3>
        <p className="text-xs text-text-muted">
          File changes retain safety files inside each Project Folder. These are separate from
          Growth and are kept until you review them. Private backups include recorded Artifacts and
          history, but not these safety files.
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy}
        loading={busy}
        onClick={() => void review()}
      >
        {overview ? 'Refresh recovery storage' : 'Review recovery storage'}
      </Button>
      {overview && (
        <>
          <p className="text-sm text-text">
            {formatBytes(overview.bytes)} of retained file data · {items.length} operations to
            review
          </p>
          <p className="text-xs text-text-muted">
            Hardlinks are counted once across this review. Some data also belongs to current files;
            this is not a measure of space you can free. Moving files to Trash frees no space until
            you empty it.
          </p>
          <p className="text-xs text-text-muted">
            Close external editors first. Use Show files to copy anything you need elsewhere before
            cleanup; do not edit a retained file in place. Unfinished operations cannot be cleaned
            up here. Completion receipts remain so retries stay safe.
          </p>
          {items.length === 0 && (
            <p className="text-sm text-text-muted">
              No retained files need review in the registered Project Folders.
            </p>
          )}
          <ul className="space-y-3">
            {items.slice(0, limit).map((item) => (
              <li
                key={`${item.folder}/${item.kind}/${item.id}`}
                data-recovery-id={item.id}
                className="border border-border rounded-[var(--radius-sm)] p-3 space-y-2"
              >
                <p className="text-sm text-text break-words">{item.originalPath}</p>
                <p className="text-xs text-text-muted break-all">
                  {shortenHomePath(item.folder)} · {item.kind} ·{' '}
                  {item.completedAt
                    ? new Date(item.completedAt).toLocaleString()
                    : 'Needs recovery'}{' '}
                  · {formatBytes(item.bytes)}
                </p>
                {item.reason && <p className="text-xs text-text-muted">{item.reason}</p>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void bridge.revealRecovery!(item.folder, item.kind, item.id).catch((error) =>
                        setError(
                          actionFailure(
                            error,
                            'Could not show these files. Refresh the recovery review and try again.',
                          ),
                        ),
                      )
                    }
                  >
                    Show files
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !!item.reason || !item.hasPayload}
                    onClick={() => void trash(item)}
                  >
                    Move retained files to Trash
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {items.length > limit && (
            <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 20)}>
              Show more operations
            </Button>
          )}
          {!!overview.warnings.length && (
            <details className="text-xs text-text-muted">
              <summary className="cursor-pointer">
                {overview.warnings.length} locations could not be fully reviewed
              </summary>
              <ul className="mt-2 space-y-2 break-words">
                {overview.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {status && (
        <p role="status" className="text-sm text-text">
          {status}
        </p>
      )}
      <ActionError failure={error} />
      <hr className="divider my-6" />
    </section>
  );
}
