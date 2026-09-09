import { useCallback, useEffect, useRef, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices, isServicesReady } from '@/services';
import { formatBytes } from '@/lib/format';
import type { StoreEntry } from '@/services/sqlite/store.service';
import { alertDialog, choiceDialog, confirmDialog } from '@/stores/dialogStore';
import {
  LOCAL_VISITOR,
  parseStoreExport,
  storeExportEntries,
  storeExportFilename,
  toStoreExport,
} from '@/lib/store-export';
import { useAuthStore } from '@/stores/authStore';
import * as liveStore from '@/api/store';
import { cn } from '@/lib/cn';
import { PaneEmpty, PaneToolbar } from './pane-ui';

type EditingCell = { key: string; field: 'key' | 'value' | 'mode' } | null;

function KeyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  );
}

export default function StorePane() {
  const crux = useCruxStore((s) => s.crux);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isPublished = !!crux?.meta?.publishedAt;
  /**
   * Two stores, one pane. Local: what the workspace preview writes (SQLite,
   * editable). Live: what visitors of the PUBLISHED crux wrote, read from the
   * API — a data explorer for the site that is actually out there.
   */
  const [source, setSource] = useState<'local' | 'live'>('local');
  const canLive = isAuthenticated && isPublished;
  const live = source === 'live' && canLive;
  const [liveEntries, setLiveEntries] = useState<liveStore.LiveStoreEntry[]>([]);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [entries, setEntries] = useState<StoreEntry[]>([]);
  const [editing, setEditing] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState('');
  const [newKey, setNewKey] = useState('');
  const [adding, setAdding] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!crux?.id || !isServicesReady()) return;
    const { store } = getServices();
    const all = await store.list(crux.id);
    setEntries(all);
  }, [crux?.id]);

  const loadLive = useCallback(async () => {
    if (!crux?.id || !live) return;
    try {
      setLiveEntries(await liveStore.listLive(crux.id));
      setLiveError(null);
    } catch (err) {
      setLiveError((err as Error)?.message || 'Could not read the live store');
    }
  }, [crux?.id, live]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);
  useEffect(() => {
    loadLive();
  }, [loadLive]);

  // Refresh when store changes (from preview iframe writes; live: visitors)
  useEffect(() => {
    if (!crux?.id) return;
    const interval = setInterval(live ? loadLive : loadEntries, live ? 5000 : 2000);
    return () => clearInterval(interval);
  }, [crux?.id, live, loadEntries, loadLive]);

  const handleDeleteLive = useCallback(
    async (key: string) => {
      if (!crux?.id) return;
      if (
        !(await confirmDialog({
          message: `Delete "${key}" from the live store? Every visitor's value for it goes too.`,
          confirmLabel: 'Delete',
          danger: true,
        }))
      )
        return;
      await liveStore.deleteLive(crux.id, key);
      await loadLive();
    },
    [crux?.id, loadLive],
  );

  // ── Export / import: one JSON document, the same for local and live ──
  const fileInput = useRef<HTMLInputElement>(null);
  const handleExport = useCallback(async () => {
    if (!crux?.id) return false;
    try {
      const doc = live
        ? await liveStore.exportLive(crux.id)
        : toStoreExport(
            crux.id,
            entries.map((e) => ({
              key: e.key,
              value: e.value,
              visitorId: e.visitorId,
              mode: e.mode === 'protected' ? 'protected' : 'public',
            })),
          );
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = storeExportFilename(crux.title, live);
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (err) {
      await alertDialog((err as Error)?.message || 'Export failed', 'Could not export the store');
      return false;
    }
  }, [crux?.id, crux?.title, live, entries]);

  /** Clear confirmation with an "export a copy first" way out. True = go ahead. */
  const confirmClear = useCallback(
    async (title: string, message: string): Promise<boolean> => {
      const { choice } = await choiceDialog({
        title,
        message: `${message} An export is the only way back.`,
        choices: [
          { id: 'clear', label: 'Clear without a copy', variant: 'danger' },
          { id: 'export', label: 'Export a copy, then clear', variant: 'primary' },
        ],
      });
      if (!choice) return false;
      if (choice === 'export') return handleExport();
      return true;
    },
    [handleExport],
  );

  const handleClearLive = useCallback(async () => {
    if (!crux?.id) return;
    if (
      !(await confirmClear(
        'Clear the live store',
        "Delete everything visitors have written to the published crux? For 5Ws that is the leaderboard and everyone's daily records.",
      ))
    )
      return;
    await liveStore.clearLive(crux.id);
    await loadLive();
  }, [crux?.id, loadLive, confirmClear]);

  const handleImportFile = useCallback(
    async (file: File) => {
      if (!crux?.id) return;
      try {
        const doc = parseStoreExport(JSON.parse(await file.text()));
        const rows = storeExportEntries(doc);
        const existing = live ? liveEntries.length : entries.length;
        let replace = false;
        if (existing > 0) {
          replace = !(await confirmDialog({
            title: `Import into the ${live ? 'live' : 'local'} store`,
            message: `${rows.length} value${rows.length === 1 ? '' : 's'} from ${file.name}. Merge them over the ${existing} row${existing === 1 ? '' : 's'} already here? Cancel to replace everything instead.`,
            confirmLabel: 'Merge',
          }));
          if (
            replace &&
            !(await confirmDialog({
              title: 'Replace the store',
              message: `Delete the ${existing} row${existing === 1 ? '' : 's'} here and load ${file.name} in their place?`,
              confirmLabel: 'Replace',
              danger: true,
            }))
          )
            return;
        }
        if (live) {
          const r = await liveStore.importLive(crux.id, doc, replace ? 'replace' : 'merge');
          await loadLive();
          if (r.skipped)
            await alertDialog(
              `${r.imported} imported. ${r.skipped} per-visitor value${r.skipped === 1 ? '' : 's'} skipped: their visitors have no account here.`,
              'Imported with skips',
            );
        } else {
          if (!isServicesReady()) return;
          const { store } = getServices();
          if (replace) await store.clear(crux.id);
          for (const row of rows)
            await store.set(
              crux.id,
              row.key,
              row.value,
              row.mode,
              row.visitorId === LOCAL_VISITOR ? null : row.visitorId,
            );
          await loadEntries();
        }
      } catch (err) {
        await alertDialog((err as Error)?.message || 'Import failed', 'Could not import');
      }
    },
    [crux?.id, live, liveEntries.length, entries.length, loadLive, loadEntries],
  );

  const handleSetValue = useCallback(
    async (key: string, value: string) => {
      if (!crux?.id || !isServicesReady()) return;
      const { store } = getServices();
      const entry = entries.find((e) => e.key === key);
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = value;
      }
      // the row's own visitor slot, or a second row appears beside it
      await store.set(crux.id, key, parsed, entry?.mode ?? 'protected', entry?.visitorId ?? null);
      await loadEntries();
    },
    [crux?.id, entries, loadEntries],
  );

  const handleToggleMode = useCallback(
    async (key: string) => {
      if (!crux?.id || !isServicesReady()) return;
      const { store } = getServices();
      const entry = entries.find((e) => e.key === key);
      if (!entry) return;
      // The two buckets: open ↔ per-user (see CONTEXT.md, "Crux Store modes")
      const newMode = entry.mode === 'public' ? 'protected' : 'public';
      await store.set(crux.id, key, entry.value, newMode, entry.visitorId ?? null);
      await loadEntries();
    },
    [crux?.id, entries, loadEntries],
  );

  const handleDelete = useCallback(
    async (key: string) => {
      if (!crux?.id || !isServicesReady()) return;
      if (
        !(await confirmDialog({
          message: `Delete key "${key}"?`,
          confirmLabel: 'Delete',
          danger: true,
        }))
      )
        return;
      const { store } = getServices();
      await store.delete(crux.id, key);
      await loadEntries();
    },
    [crux?.id, loadEntries],
  );

  const handleAdd = useCallback(async () => {
    if (!crux?.id || !isServicesReady() || !newKey.trim()) return;
    const { store } = getServices();
    await store.set(crux.id, newKey.trim(), null, 'protected');
    setNewKey('');
    setAdding(false);
    await loadEntries();
  }, [crux?.id, newKey, loadEntries]);

  const handleClearAll = useCallback(async () => {
    if (!crux?.id || !isServicesReady()) return;
    if (!(await confirmClear('Clear the store', 'Clear all store entries?'))) return;
    const { store } = getServices();
    await store.clear(crux.id);
    await loadEntries();
  }, [crux?.id, loadEntries, confirmClear]);

  const startEdit = (key: string, field: 'value') => {
    const entry = entries.find((e) => e.key === key);
    if (!entry) return;
    const display = typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
    setEditing({ key, field });
    setEditValue(display);
  };

  const commitEdit = async () => {
    if (!editing) return;
    await handleSetValue(editing.key, editValue);
    setEditing(null);
  };

  const totalSize = entries.reduce((sum, e) => {
    const v = typeof e.value === 'string' ? e.value : JSON.stringify(e.value);
    return sum + new TextEncoder().encode(v).length;
  }, 0);

  if (!crux) {
    return (
      <div className="flex flex-col h-full">
        <PaneEmpty title="No crux loaded" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-text text-sm">
      {/* Header */}
      <PaneToolbar>
        <div
          className="flex items-center gap-0.5 text-2xs font-mono uppercase tracking-wider"
          role="tablist"
          aria-label="Store source"
        >
          {(['local', 'live'] as const).map((src) => (
            <button
              key={src}
              role="tab"
              aria-selected={source === src}
              disabled={src === 'live' && !canLive}
              onClick={() => setSource(src)}
              className={cn(
                'px-1.5 py-0.5 rounded-[var(--radius-sm)] transition-colors cursor-pointer disabled:cursor-default disabled:opacity-40',
                source === src ? 'text-text bg-surface-solid' : 'text-text-muted hover:text-text',
              )}
              title={
                src === 'local'
                  ? 'What the workspace preview writes (this machine)'
                  : canLive
                    ? 'What visitors of the published crux wrote'
                    : isPublished
                      ? 'Connect your account to read the live store'
                      : 'Publish the crux to have a live store'
              }
              data-testid={`store-source-${src}`}
            >
              {src === 'local' ? 'Local' : 'Live'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {!live && (
            <button
              onClick={() => setAdding(true)}
              className="text-xs px-2 py-0.5 rounded-[var(--radius-sm)] border border-border bg-surface hover:border-accent hover:text-accent text-text transition-colors cursor-pointer"
            >
              + Add key
            </button>
          )}
          {live && liveEntries.length > 0 && (
            <button
              onClick={handleClearLive}
              className="text-xs text-text-muted hover:text-error transition-colors"
              title="Delete everything visitors wrote"
            >
              Clear
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={live ? liveEntries.length === 0 : entries.length === 0}
            className="text-xs text-text-muted hover:text-text transition-colors disabled:opacity-40 disabled:cursor-default"
            title={
              live
                ? 'Save everything visitors wrote as a JSON file'
                : 'Save the local store as a JSON file'
            }
            data-testid="store-export"
          >
            Export
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="text-xs text-text-muted hover:text-text transition-colors"
            title="Load a Crux Store export (JSON) into this store"
            data-testid="store-import"
          >
            Import
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void handleImportFile(f);
            }}
          />
          <button
            onClick={live ? loadLive : loadEntries}
            className="text-xs text-text-muted hover:text-text"
            title="Refresh"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </PaneToolbar>

      {/* Add row */}
      {adding && !live && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-surface">
          <input
            autoFocus
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewKey('');
              }
            }}
            placeholder="key name"
            className="flex-1 bg-transparent text-sm font-mono outline-none text-text placeholder:text-text-muted"
          />
          <button onClick={handleAdd} className="text-xs text-accent">
            Add
          </button>
          <button
            onClick={() => {
              setAdding(false);
              setNewKey('');
            }}
            className="text-xs text-text-muted"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Live table — read-only values; delete only */}
      {live && (
        <div className="flex-1 overflow-auto" data-testid="store-live">
          {liveError ? (
            <PaneEmpty
              title="Could not read the live store"
              description={liveError}
              className="h-full"
            />
          ) : liveEntries.length === 0 ? (
            <PaneEmpty
              icon={<KeyIcon />}
              title="Nothing written yet"
              description="Keys appear here as visitors of the published crux write them."
              className="h-full"
            />
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="px-3 py-1.5 font-mono font-normal">Key</th>
                  <th className="px-3 py-1.5 font-mono font-normal">Value</th>
                  <th className="px-3 py-1.5 font-mono font-normal w-20">Mode</th>
                  <th className="px-3 py-1.5 font-mono font-normal w-28">Updated</th>
                  <th className="px-3 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {liveEntries.map((entry) => {
                  const text =
                    typeof entry.value === 'string' ? entry.value : JSON.stringify(entry.value);
                  return (
                    <tr
                      key={`${entry.key}:${entry.visitorId ?? ''}`}
                      className="border-b border-border hover:bg-surface"
                    >
                      <td className="px-3 py-1.5 font-mono text-accent">
                        {entry.key}
                        {entry.visitorId && (
                          <span
                            className="ml-1.5 text-text-muted"
                            title={`Visitor ${entry.visitorId}`}
                          >
                            · {entry.visitorId.slice(0, 8)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono max-w-[240px] truncate" title={text}>
                        <span className="text-text">{text}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                            entry.mode === 'public'
                              ? 'bg-warning-bg text-warning-text border border-warning-border'
                              : 'bg-surface text-text-muted'
                          }`}
                        >
                          {entry.mode}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-text-muted whitespace-nowrap">
                        {new Date(entry.updatedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-3 py-1.5">
                        <button
                          onClick={() => handleDeleteLive(entry.key)}
                          className="text-text-muted hover:text-error transition-colors"
                          title="Delete this key from the live store"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Table */}
      {!live && (
        <div className="flex-1 overflow-auto">
          {entries.length === 0 ? (
            <PaneEmpty
              icon={<KeyIcon />}
              title="No store entries yet"
              description="Key-value data your published crux can read and write with the crux.store SDK."
              className="h-full"
            >
              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  className="text-xs text-accent hover:text-text transition-colors cursor-pointer"
                >
                  Add your first key
                </button>
              )}
            </PaneEmpty>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="px-3 py-1.5 font-mono font-normal">Key</th>
                  <th className="px-3 py-1.5 font-mono font-normal">Value</th>
                  <th className="px-3 py-1.5 font-mono font-normal w-20">Mode</th>
                  <th className="px-3 py-1.5 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.key} className="border-b border-border hover:bg-surface">
                    <td className="px-3 py-1.5 font-mono text-accent">{entry.key}</td>
                    <td
                      className="px-3 py-1.5 font-mono cursor-pointer max-w-[200px] truncate"
                      onClick={() => startEdit(entry.key, 'value')}
                      title="Click to edit"
                    >
                      {editing?.key === entry.key && editing.field === 'value' ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          className="w-full bg-bg text-text px-1 py-0.5 rounded outline-none ring-1 ring-accent"
                        />
                      ) : (
                        <span className="text-text">
                          {typeof entry.value === 'string'
                            ? entry.value
                            : JSON.stringify(entry.value)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => handleToggleMode(entry.key)}
                        className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          entry.mode === 'public'
                            ? 'bg-warning-bg text-warning-text border border-warning-border'
                            : 'bg-surface text-text-muted'
                        }`}
                        title={
                          entry.mode === 'public'
                            ? 'Open: anyone reads, a connected account writes'
                            : 'Protected user: per account, private'
                        }
                      >
                        {entry.mode}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => handleDelete(entry.key)}
                        className="text-text-muted hover:text-error transition-colors"
                        title="Delete key"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-text-muted text-xs">
        {live ? (
          <span>
            {liveEntries.length} row{liveEntries.length !== 1 ? 's' : ''} ·{' '}
            {new Set(liveEntries.map((e) => e.key)).size} key
            {new Set(liveEntries.map((e) => e.key)).size !== 1 ? 's' : ''} · live
          </span>
        ) : (
          <span>
            {entries.length} key{entries.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
          </span>
        )}
        {!live && entries.length > 0 && (
          <button onClick={handleClearAll} className="hover:text-error transition-colors">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
