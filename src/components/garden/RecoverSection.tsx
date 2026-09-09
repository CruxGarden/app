import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { useGardenStore } from '@/stores/gardenStore';
import { Button } from '@/components/ui';
import { formatBytes, formatDateTime } from '@/lib/format';
import { confirmDialog } from '@/stores/dialogStore';
import * as cruxesApi from '@/api/cruxes';
import {
  listCloudOnlyCruxes,
  restoreSyncedCrux,
  recoverPublishedCrux,
  type CloudOnlyCrux,
} from '@/services/recover';

/**
 * "In your account, not on this machine" (RESILIENCE-PLAN §2c). Shown on the
 * Home Garden when the account holds cruxes this garden lacks. Restore brings a
 * synced archive back whole; Recover rebuilds from the published site; Unshare
 * takes an orphaned site down.
 */
export default function RecoverSection() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const author = useAppStore((s) => s.author);
  const allCruxes = useGardenStore((s) => s.allCruxes);
  const refresh = useGardenStore((s) => s.refresh);
  const [rows, setRows] = useState<CloudOnlyCrux[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setRows(null);
      return;
    }
    try {
      setRows(await listCloudOnlyCruxes(new Set(allCruxes.map((c) => c.id))));
    } catch {
      setRows(null); // the account could not be read; the section simply stays away
    }
  }, [isAuthenticated, allCruxes]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (row: CloudOnlyCrux, action: 'restore' | 'recover' | 'unshare') => {
    setBusy(`${row.id}:${action}`);
    setError(null);
    try {
      if (action === 'restore') await restoreSyncedCrux(row, setProgress);
      else if (action === 'recover') {
        if (!row.published || !author) throw new Error('Nothing published to recover from');
        await recoverPublishedCrux(row.published, author.username, setProgress);
      } else {
        if (
          !(await confirmDialog({
            title: 'Unshare this crux',
            message: `Take ${row.title} offline? It is not on this machine, so there is nothing else to keep.`,
            confirmLabel: 'Unshare',
            danger: true,
          }))
        )
          return;
        await cruxesApi.unpublish(row.id);
      }
      await refresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  if (!rows || rows.length === 0) return null;
  return (
    <section
      className="bg-panel border border-border rounded-[var(--radius)] p-4 sm:p-5 mb-6"
      data-testid="recover-section"
      aria-label="In your account, not on this machine"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="font-display text-base text-text">In your account, not on this machine</h2>
        <span className="text-xxs font-mono text-text-muted">
          {rows.length} crux{rows.length === 1 ? '' : 'es'}
        </span>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Restore brings a backup back whole. Recover rebuilds a crux from what its published site
        serves — the files visitors see and the public conversation, not the history.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => {
          const isSite = !!(row.published?.meta as Record<string, unknown> | undefined)?.site;
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 py-2"
              data-testid={`recover-${row.slug}`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm text-text truncate">{row.title}</div>
                <div className="text-xxs font-mono text-text-muted truncate">
                  {row.synced
                    ? `Backup · ${formatDateTime(row.synced.updatedAt)} · ${formatBytes(row.synced.size)}`
                    : 'No backup'}
                  {row.published ? ' · published' : ''}
                  {row.published && !row.synced && isSite ? ' · built output only' : ''}
                </div>
              </div>
              {busy?.startsWith(row.id) ? (
                <span className="text-xxs font-mono text-text-muted">{progress || 'Working…'}</span>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  {row.synced && (
                    <Button size="sm" onClick={() => void run(row, 'restore')}>
                      Restore
                    </Button>
                  )}
                  {row.published && !row.synced && (
                    <Button size="sm" variant="secondary" onClick={() => void run(row, 'recover')}>
                      Recover
                    </Button>
                  )}
                  {row.published && (
                    <Button size="sm" variant="ghost" onClick={() => void run(row, 'unshare')}>
                      Unshare
                    </Button>
                  )}
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
