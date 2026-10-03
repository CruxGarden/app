import ActionError from '@/components/ui/ActionError';
import { actionFailure, type ActionFailure } from '@/lib/action-failure';
import { useState } from 'react';
import { useCruxStore, useCruxStoreApi, selectHasUnpublishedChanges } from '@/stores/cruxStore';
import { useWorkspaceUIStoreApi } from '@/stores/uiStore';
import { useWorkspaceRegistry } from '@/stores/workspaceRegistry';
import { documentsFor } from '@/services/workspace-documents';
import { backupOf } from '@/services/backup';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui';

/** Distinguish local drafts, publication and backup; none is a synonym for the others. */
export default function WorkspaceStatus() {
  const data = useCruxStoreApi();
  const ui = useWorkspaceUIStoreApi();
  const crux = useCruxStore((s) => s.crux);
  const missing = useCruxStore((s) => s.folderMissing);
  const historical = useCruxStore((s) => !!s.viewingSnapshotId);
  const phase = useCruxStore((s) => s.publishPhase);
  const changed = useCruxStore(selectHasUnpublishedChanges);
  const dirty = useWorkspaceRegistry(
    (s) => s.entries.find((entry) => entry.id === crux?.id)?.dirty ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ActionFailure | null>(null);
  const backup = backupOf(crux);
  const publication = phase
    ? 'Publishing…'
    : crux?.meta?.publishedAt
      ? changed
        ? 'Published · changes to share'
        : 'Published'
      : 'Private';
  const local = historical
    ? 'History view'
    : missing
      ? 'Folder unavailable'
      : dirty
        ? 'Unsaved edits'
        : 'On this device';
  return (
    <details className="shrink-0 mx-3 my-1 text-xs text-text-muted" data-testid="workspace-status">
      <summary className="cursor-pointer rounded-[var(--radius-sm)] px-2 py-1 hover:bg-action-button-hover hover:text-text">
        <span role="status">
          {local} · {publication}
        </span>
      </summary>
      <div className="bg-panel border border-border rounded-[var(--radius-sm)] p-3 mt-1 space-y-2">
        <p>
          {dirty
            ? 'There are editor changes that have not been saved.'
            : 'Your files live in this Garden. Each tool also shows its own save progress.'}{' '}
          Publishing sends a separate copy to visitors.
        </p>
        <p>
          {backup
            ? `Last backup: ${formatDateTime(backup.at)}. Changes made since then may not be included.`
            : 'No backup recorded for this Crux.'}{' '}
          A published page is not a backup of your sources and history.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || historical || missing}
            onClick={() => {
              setBusy(true);
              setError(null);
              void documentsFor(data, ui)
                .saveAll()
                .catch((e) =>
                  setError(
                    actionFailure(
                      e,
                      'Could not save all editor changes. Keep this Crux open, check the details, then retry Save editor changes.',
                    ),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Saving…' : 'Save editor changes'}
          </Button>
          <Button size="sm" onClick={() => ui.getState().setPaneVisible('publish', true)}>
            Open Share
          </Button>
          <Button size="sm" onClick={() => ui.getState().setPaneVisible('sync', true)}>
            Backups
          </Button>
        </div>
        <ActionError failure={error} />
      </div>
    </details>
  );
}
