import { useState } from 'react';
import { useGardenStore, TRASH_RETENTION_DAYS } from '@/stores/gardenStore';
import { Button } from '@/components/ui';
import { confirmDialog } from '@/stores/dialogStore';
import { formatDateTime } from '@/lib/format';

/**
 * Recently deleted — the Trash. Deleting a crux from the grid only marks it;
 * the rows and the Project Folder stay until the user deletes it for good or
 * TRASH_RETENTION_DAYS pass (RESILIENCE-PLAN § Guardrails). Restore puts the
 * crux back exactly as it was, history and all.
 */
export default function TrashSection() {
  const trashed = useGardenStore((s) => s.trashed);
  const restoreCrux = useGardenStore((s) => s.restoreCrux);
  const destroyCrux = useGardenStore((s) => s.destroyCrux);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (trashed.length === 0) return null;

  const restore = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await restoreCrux(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const destroy = async (id: string, title: string) => {
    if (
      !(await confirmDialog({
        title: 'Delete forever',
        message: `Delete ${title} for good? Its history and conversation go with it. The Project Folder on disk is left where it is.`,
        confirmLabel: 'Delete forever',
        danger: true,
      }))
    )
      return;
    setBusy(id);
    setError(null);
    try {
      await destroyCrux(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mt-6"
      data-testid="trash-section"
      aria-label="Recently deleted"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="font-display text-base text-text">Recently deleted</h2>
        <span className="text-xxs font-mono text-text-muted">
          {trashed.length} crux{trashed.length === 1 ? '' : 'es'}
        </span>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Restore brings a crux back whole. Anything left here for {TRASH_RETENTION_DAYS} days is
        deleted for good.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {trashed.map((crux) => {
          const title = crux.title || crux.slug;
          return (
            <li
              key={crux.id}
              className="flex items-center gap-3 py-2"
              data-testid={`trash-${crux.slug}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text truncate">{title}</div>
                <div className="text-xxs font-mono text-text-muted truncate">
                  Deleted {crux.deleted ? formatDateTime(crux.deleted) : ''}
                  {crux.meta?.publishedAt ? ' · still published' : ''}
                </div>
              </div>
              {busy === crux.id ? (
                <span className="text-xxs font-mono text-text-muted">Working…</span>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" onClick={() => void restore(crux.id)}>
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void destroy(crux.id, title)}>
                    Delete forever
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-xxs font-mono text-error mt-2">
          {error}
        </p>
      )}
    </section>
  );
}
