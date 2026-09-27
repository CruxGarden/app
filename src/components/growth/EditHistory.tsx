import { useCallback, useEffect, useState } from 'react';
import { linkClass } from '@/components/ui/button-class';
import {
  listEditHistory,
  inspectEditCheckpoint,
  restoreEditCheckpoint,
} from '@/services/edit-history';
import { getSqliteClient } from '@/services/sqlite/client';
import { confirmDialog } from '@/stores/dialogStore';
import { Button } from '@/components/ui';
type History = Awaited<ReturnType<typeof listEditHistory>>;

export default function EditHistory({ cruxId }: { cruxId: string }) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<{ id: string; paths: string[] } | null>(null);
  const refresh = useCallback(
    () =>
      listEditHistory(cruxId)
        .then(setHistory)
        .catch((err) => setError((err as Error).message)),
    [cruxId],
  );
  useEffect(() => {
    void refresh();
    return getSqliteClient().onChange?.((change) => {
      if (
        change.id === cruxId &&
        change.fields?.some((field) => field === 'editHistory' || field === 'fileContent')
      )
        void refresh();
    });
  }, [cruxId, refresh]);
  const restore = async (checkpointId: string, includeConversation = false) => {
    if (
      !(await confirmDialog({
        title: includeConversation ? 'Restore this workspace?' : 'Restore these files?',
        message: includeConversation
          ? 'Your current files and conversation context will be kept as a safety copy. This returns to the saved conversation and version branch.'
          : 'Your current files will be kept as a safety copy. Your conversation stays unchanged.',
        confirmLabel: includeConversation ? 'Restore workspace' : 'Restore files',
      }))
    )
      return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const result = await restoreEditCheckpoint(cruxId, checkpointId, includeConversation);
      setStatus(
        'recovered' in result
          ? 'Finished the previous restore. Select another recovery point if needed.'
          : includeConversation
            ? 'Files and conversation restored. The previous workspace is kept as a safety copy.'
            : 'Files restored. The previous files are kept as a safety copy.',
      );
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Edit history" className="p-3 space-y-3">
      <p className="text-xs text-text-muted">
        Recent file recovery points. The latest 20 automatic checkpoints are kept; safety copies
        stay available. Restoring files keeps your conversation.
      </p>
      {error && (
        <p role="alert" className="text-sm text-error">
          {error}{' '}
          <button
            className={linkClass()}
            onClick={() => {
              setError('');
              void refresh();
            }}
          >
            Retry
          </button>
        </p>
      )}
      {status && (
        <p role="status" className="text-xs text-text-muted">
          {status}
        </p>
      )}
      {!history ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : !history.checkpoints.length ? (
        <p className="text-sm text-text-muted">Recovery points appear as you edit.</p>
      ) : (
        <ol className="space-y-2">
          {[...history.checkpoints].reverse().map((checkpoint, index) => (
            <li
              key={checkpoint.id}
              className="border border-border rounded-[var(--radius-sm)] p-3 text-sm"
              data-checkpoint-id={checkpoint.id}
            >
              <div className="flex justify-between gap-2">
                <span>{checkpoint.reason === 'safety' ? 'Safety copy' : 'Autosave'}</span>
                <time className="text-xs text-text-muted" dateTime={checkpoint.created}>
                  {new Date(checkpoint.created).toLocaleString()}
                </time>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Inspect recovery point ${index + 1}`}
                  onClick={() => {
                    setError('');
                    void inspectEditCheckpoint(cruxId, checkpoint.id)
                      .then((result) =>
                        setFiles({
                          id: checkpoint.id,
                          paths: result.files.map((file) => file.path),
                        }),
                      )
                      .catch((err) => setError((err as Error).message));
                  }}
                >
                  Files
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  aria-label={`Restore recovery point ${index + 1}`}
                  onClick={() => void restore(checkpoint.id)}
                >
                  Restore files
                </Button>
                {checkpoint.workspace && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Restore workspace recovery point ${index + 1}`}
                    onClick={() => void restore(checkpoint.id, true)}
                  >
                    Restore workspace
                  </Button>
                )}
              </div>
              {checkpoint.workspace && (
                <p className="mt-2 text-xs text-text-muted">
                  Includes the saved version branch and {checkpoint.workspace.messages.length}{' '}
                  unmarked conversation messages.
                </p>
              )}
              {files?.id === checkpoint.id && (
                <ul className="mt-2 text-xs font-mono text-text-muted break-all">
                  {files.paths.map((path) => (
                    <li key={path}>{path}</li>
                  ))}
                  {!files.paths.length && <li>No files</li>}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
