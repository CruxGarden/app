import { useCallback, useEffect, useState } from 'react';
import { useCruxStore } from '@/stores/cruxStore';
import { getServices, isServicesReady } from '@/services';
import { formatBytes } from '@/lib/format';
import type { StoreEntry } from '@/services/sqlite/store.service';
import { confirmDialog } from '@/stores/dialogStore';
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

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  // Refresh when store changes (from preview iframe writes)
  useEffect(() => {
    if (!crux?.id) return;
    const interval = setInterval(loadEntries, 2000);
    return () => clearInterval(interval);
  }, [crux?.id, loadEntries]);

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
      await store.set(crux.id, key, parsed, entry?.mode ?? 'protected');
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
      const newMode = entry.mode === 'public' ? 'protected' : 'public';
      await store.set(crux.id, key, entry.value, newMode);
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
    if (
      !(await confirmDialog({
        message: 'Clear all store entries?',
        confirmLabel: 'Clear all',
        danger: true,
      }))
    )
      return;
    const { store } = getServices();
    await store.clear(crux.id);
    await loadEntries();
  }, [crux?.id, loadEntries]);

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
        <span className="text-2xs font-mono uppercase tracking-wider text-text-muted">
          Local store
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-2 py-0.5 rounded-[var(--radius-sm)] border border-border bg-surface hover:border-accent hover:text-accent text-text transition-colors cursor-pointer"
          >
            + Add key
          </button>
          <button
            onClick={loadEntries}
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
      {adding && (
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

      {/* Table */}
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
                          ? 'Anyone can read/write'
                          : 'Requires crux.garden account'
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

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border text-text-muted text-xs">
        <span>
          {entries.length} key{entries.length !== 1 ? 's' : ''} · {formatBytes(totalSize)}
        </span>
        {entries.length > 0 && (
          <button onClick={handleClearAll} className="hover:text-error transition-colors">
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
