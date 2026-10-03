import ActionError from '@/components/ui/ActionError';
import { actionFailure, type ActionFailure } from '@/lib/action-failure';
import { useRef, useState } from 'react';
import { useMoodNavigate } from '@/hooks/useMoodNavigate';
import { useGardenContext, gardenPath } from '@/stores/gardenContext';
import { useGardenStore } from '@/stores/gardenStore';
import { getServices } from '@/services';
import { getSqliteClient } from '@/services/sqlite/client';
import type { Crux } from '@/api/types';
import { Button, buttonClass, fieldClass } from '@/components/ui';
import { importGardenPackage } from '@/services/garden-package';

/** Explicit placement actions; moving preserves the Crux and its content. */
export default function GardenActions() {
  const garden = useGardenContext((s) => s.garden);
  const members = useGardenStore((s) => s.allCruxes);
  const root = useGardenContext((s) => s.root);
  const [mode, setMode] = useState<'new' | 'add' | null>(null);
  const [title, setTitle] = useState('');
  const [available, setAvailable] = useState<
    { crux: Crux; parents: { id: string; title?: string; slug: string }[] }[]
  >([]);
  const [error, setError] = useState<ActionFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const packageInput = useRef<HTMLInputElement>(null);
  const navigate = useMoodNavigate();
  if (!garden) return null;
  const finish = () => {
    setMode(null);
    setTitle('');
    setError(null);
    void useGardenStore.getState().refresh();
  };
  return (
    <section aria-label="Garden actions" className="mb-4">
      <div className="flex flex-wrap items-center gap-1 -ml-2.5">
        <button
          className={buttonClass('ghost', 'xs', 'text-text-muted')}
          aria-expanded={mode === 'new'}
          onClick={() => {
            setMode('new');
            setError(null);
          }}
        >
          New Garden
        </button>
        <button
          className={buttonClass('ghost', 'xs', 'text-text-muted')}
          aria-expanded={mode === 'add'}
          onClick={() => {
            setMode('add');
            setError(null);
            setAvailable([]);
            setBusy(true);
            const destination = garden.id;
            void getServices()
              .crux.listAll()
              .then(async (rows) => {
                const candidates = rows.filter(
                  (row) =>
                    row.id !== destination &&
                    row.id !== root?.id &&
                    !members.some((member) => member.id === row.id),
                );
                const locations = await Promise.all(
                  candidates.map(async (crux) => ({
                    crux,
                    parents: await getSqliteClient().gardenMembership!.parents(crux.id),
                  })),
                );
                if (useGardenContext.getState().garden?.id === destination) setAvailable(locations);
              })
              .catch((err) => {
                if (useGardenContext.getState().garden?.id === destination)
                  setError(
                    actionFailure(
                      err,
                      'Could not load your Cruxes. Close this list and try Add existing Crux again.',
                    ),
                  );
              })
              .finally(() => setBusy(false));
          }}
        >
          Add existing Crux
        </button>
        <button
          className={buttonClass('ghost', 'xs', 'text-text-muted')}
          disabled={busy}
          onClick={() => packageInput.current?.click()}
        >
          Import Garden
        </button>
        <input
          ref={packageInput}
          type="file"
          accept=".cruxspace"
          aria-label="Garden package"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const destination = garden.id;
            const origin = window.location.href;
            setBusy(true);
            setError(null);
            void importGardenPackage(file, destination)
              .then((id) => {
                finish();
                if (window.location.href === origin) navigate(gardenPath(id));
              })
              .catch((err) =>
                setError(
                  actionFailure(
                    err,
                    'Import could not finish. Check what was added before retrying; the details explain where it stopped.',
                  ),
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
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
            setError(null);
            void getServices()
              .crux.create({ title: title.trim(), kind: 'garden', gardenId: destination })
              .then((created) => {
                finish();
                if (window.location.href === origin) navigate(gardenPath(created.id));
              })
              .catch((err) =>
                setError(
                  actionFailure(
                    err,
                    'Could not create the Garden. Keep the name and try Create Garden again.',
                  ),
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <input
            autoFocus
            aria-label="Garden name"
            placeholder="Garden name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldClass(undefined, 'min-w-0 flex-1')}
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
        <div className="mt-3 rounded-[var(--radius)] border border-border bg-panel p-3 motion-enter-dropdown">
          <div className="flex gap-2 mb-2">
            <input
              autoFocus
              aria-label="Find existing Crux"
              placeholder="Find a Crux…"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={fieldClass(undefined, 'flex-1 min-w-0')}
            />
            <Button variant="ghost" onClick={() => setMode(null)}>
              Done
            </Button>
          </div>
          <ul className="max-h-60 overflow-auto">
            {available
              .filter(({ crux: row }) =>
                `${row.title} ${row.slug}`.toLowerCase().includes(title.toLowerCase()),
              )
              .map(({ crux: row, parents }) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-2 -mx-2 py-2 rounded-[var(--radius-sm)] text-sm text-text hover:bg-action-button-hover"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{row.title || row.slug}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {parents.length
                        ? `In ${parents.map((parent) => parent.title || parent.slug).join(', ')}`
                        : 'Not in a Garden'}
                    </span>
                  </span>
                  <button
                    disabled={busy}
                    aria-label={`${parents.length ? 'Move' : 'Add'} ${row.title || row.slug} to this Garden`}
                    className={buttonClass('secondary', 'xs')}
                    onClick={() => {
                      const destination = garden.id;
                      setBusy(true);
                      setError(null);
                      const membership = getSqliteClient().gardenMembership!;
                      const request = parents.length
                        ? membership.move({
                            gardenId: destination,
                            memberId: row.id,
                            expectedParents: parents.map((parent) => parent.id),
                          })
                        : membership.add({ gardenId: destination, memberId: row.id });
                      void request
                        .then(() => {
                          setAvailable((rows) => rows.filter((item) => item.crux.id !== row.id));
                          void useGardenStore.getState().refresh();
                        })
                        .catch((err) =>
                          setError(
                            actionFailure(
                              err,
                              'Could not update this Garden. Reopen Add existing Crux to refresh its locations, then retry.',
                            ),
                          ),
                        )
                        .finally(() => setBusy(false));
                    }}
                  >
                    {parents.length ? 'Move here' : 'Add'}
                  </button>
                </li>
              ))}
          </ul>
          {!busy && !available.length && (
            <p className="text-sm text-text-muted py-2">No other Cruxes to add.</p>
          )}
        </div>
      )}
      <ActionError failure={error} />
    </section>
  );
}
