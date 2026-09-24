import { useState } from 'react';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useGardenContext, gardenPath } from '@/stores/gardenContext';
import { useGardenStore } from '@/stores/gardenStore';
import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import type { Crux } from '@/api/types';
import { Button } from '@/components/ui';

/** Small, in-panel actions. A link is always explicit and never clones content. */
export default function GardenActions() {
  const garden = useGardenContext((s) => s.garden);
  const members = useGardenStore((s) => s.allCruxes);
  const [mode, setMode] = useState<'new' | 'add' | null>(null);
  const [title, setTitle] = useState('');
  const [available, setAvailable] = useState<Crux[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useMoodNavigate();
  if (!garden) return null;
  const finish = () => {
    setMode(null);
    setTitle('');
    setError('');
    void useGardenStore.getState().refresh();
  };
  return (
    <section aria-label="Garden actions" className="mb-4">
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <button
          className="hover:text-text cursor-pointer"
          onClick={() => {
            setMode('new');
            setError('');
          }}
        >
          New Garden
        </button>
        <button
          className="hover:text-text cursor-pointer"
          onClick={() => {
            setMode('add');
            setError('');
            void getServices()
              .crux.listAll()
              .then((rows) =>
                setAvailable(
                  rows.filter(
                    (row) =>
                      row.id !== garden.id && !members.some((member) => member.id === row.id),
                  ),
                ),
              )
              .catch((err) => setError((err as Error).message));
          }}
        >
          Add existing Crux
        </button>
      </div>
      {mode === 'new' && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim() || busy) return;
            const destination = garden.id;
            const origin = window.location.href;
            setBusy(true);
            setError('');
            void getServices()
              .crux.create({ title: title.trim(), kind: 'garden', gardenId: destination })
              .then((created) => {
                finish();
                if (window.location.href === origin) navigate(gardenPath(created.id));
              })
              .catch((err) => setError((err as Error).message))
              .finally(() => setBusy(false));
          }}
        >
          <input
            autoFocus
            aria-label="Garden name"
            placeholder="Garden name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-0 flex-1 bg-input border border-input-border rounded-input px-3 py-2 text-sm text-input-text"
          />
          <Button type="submit" disabled={busy || !title.trim()}>
            Create Garden
          </Button>
          <Button type="button" variant="ghost" onClick={() => setMode(null)}>
            Cancel
          </Button>
        </form>
      )}
      {mode === 'add' && (
        <div className="mt-3 rounded-[var(--radius)] border border-border bg-panel p-3">
          <div className="flex gap-2 mb-2">
            <input
              autoFocus
              aria-label="Find existing Crux"
              placeholder="Find a Crux…"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="flex-1 min-w-0 bg-input rounded-input px-3 py-2 text-sm text-input-text"
            />
            <Button variant="ghost" onClick={() => setMode(null)}>
              Done
            </Button>
          </div>
          <ul className="max-h-60 overflow-auto">
            {available
              .filter((row) =>
                `${row.title} ${row.slug}`.toLowerCase().includes(title.toLowerCase()),
              )
              .map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm text-text"
                >
                  <span className="truncate">{row.title || row.slug}</span>
                  <button
                    disabled={busy}
                    aria-label={`Add ${row.title || row.slug} to this Garden`}
                    className="text-accent cursor-pointer shrink-0"
                    onClick={() => {
                      const destination = garden.id;
                      setBusy(true);
                      setError('');
                      void getSqliteClient()
                        .gardenMembership!.add({ gardenId: destination, memberId: row.id })
                        .then(() => {
                          setAvailable((rows) => rows.filter((item) => item.id !== row.id));
                          void useGardenStore.getState().refresh();
                        })
                        .catch((err) => setError((err as Error).message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Add
                  </button>
                </li>
              ))}
          </ul>
          {!available.length && (
            <p className="text-sm text-text-muted py-2">Everything is already here.</p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </section>
  );
}
