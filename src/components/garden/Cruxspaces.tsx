import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/components/ui';
import { getServices } from '@/services';
import type { Crux } from '@/api/types';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import {
  CRUXSPACES_CHANGED,
  createCruxspace,
  deleteCruxspace,
  listCruxspaces,
  updateCruxspace,
  type Cruxspace,
} from '@/services/cruxspaces';
import {
  listCruxspaceAssets,
  copyCruxspaceAsset,
  type CruxspaceAsset,
} from '@/services/cruxspace-assets';
import { findWorkingCopy } from '@/services/working-copies';

const field = 'w-full rounded-[var(--radius-sm)] border border-border bg-bg p-2 text-sm text-text';
function Thumbnail({ asset }: { asset: CruxspaceAsset }) {
  const url = useBlobUrl(asset.fingerprint, asset.mimeType);
  return url ? (
    <img
      src={url}
      alt={asset.label}
      className="w-full h-28 object-contain bg-bg rounded-[var(--radius-sm)]"
    />
  ) : (
    <div className="h-28 bg-bg" />
  );
}

/** Home hub and Workshop picker share discovery, selection and transfer behavior. */
export default function Cruxspaces({
  targetId,
  runOperation = (operation) => operation(),
}: {
  targetId?: string;
  runOperation?: <T>(operation: () => Promise<T>) => Promise<T>;
}) {
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Cruxspace[]>([]);
  const [cruxes, setCruxes] = useState<Crux[]>([]);
  const [selected, setSelected] = useState('');
  const [assets, setAssets] = useState<CruxspaceAsset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Cruxspace | 'new' | null>(null);
  const [name, setName] = useState('');
  const [brief, setBrief] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [using, setUsing] = useState<CruxspaceAsset | null>(null);
  const [receiver, setReceiver] = useState('');
  const [path, setPath] = useState('');
  const [result, setResult] = useState<{ path: string; id: string; label: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const space = spaces.find((s) => s.id === selected);
  const load = useCallback(async () => {
    const [all, live, copy] = await Promise.all([
      listCruxspaces(),
      getServices().crux.listAll(),
      targetId ? findWorkingCopy(targetId) : null,
    ]);
    const visible = targetId
      ? all.filter((s) => s.cruxIds.includes(copy?.cruxId ?? targetId))
      : all;
    setSpaces(visible);
    setCruxes(live);
    setSelected((id) => (visible.some((s) => s.id === id) ? id : (visible[0]?.id ?? '')));
  }, [targetId]);
  useEffect(() => {
    const reload = () => void load().catch((e) => setError(e.message));
    reload();
    window.addEventListener(CRUXSPACES_CHANGED, reload);
    return () => window.removeEventListener(CRUXSPACES_CHANGED, reload);
  }, [load]);
  useEffect(() => {
    let current = true;
    setAssets([]);
    if (selected)
      void listCruxspaceAssets(selected)
        .then((a) => {
          if (current) setAssets(a);
        })
        .catch((e) => {
          if (current) setError(e.message);
        });
    return () => {
      current = false;
    };
  }, [selected, spaces, refresh]);
  const action = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await runOperation(operation);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const edit = (value: Cruxspace | 'new') => {
    setEditing(value);
    setError('');
    setName(value === 'new' ? '' : value.name);
    setBrief(value === 'new' ? '' : value.brief);
    setMembers(value === 'new' ? [] : value.cruxIds);
  };
  return (
    <section
      aria-label="Cruxspaces"
      className="bg-panel border border-border rounded-[var(--radius)] p-4 mb-6 text-text"
    >
      <div className="flex flex-wrap gap-3 items-center justify-between mb-3">
        <div>
          <h2 className="font-display text-lg">
            {targetId ? 'Assets from your Cruxspaces' : 'Cruxspaces'}
          </h2>
          <p className="text-sm text-text-muted">
            Related Cruxes, a shared brief and ready-to-use outputs.
          </p>
        </div>
        {!targetId && <Button onClick={() => edit('new')}>Create Cruxspace</Button>}
      </div>
      {error && !editing && !using && (
        <p role="alert" className="text-error text-sm mb-3">
          {error}
        </p>
      )}
      {spaces.length > 0 ? (
        <>
          <div className="flex gap-2 items-center mb-3">
            <select
              aria-label="Cruxspace"
              className={field}
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setResult(null);
              }}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {!targetId && space && <Button onClick={() => edit(space)}>Edit Cruxspace</Button>}
            <Button
              disabled={busy}
              onClick={() => {
                setError('');
                setRefresh((n) => n + 1);
              }}
            >
              Refresh assets
            </Button>
          </div>
          {space?.brief && <p className="text-sm whitespace-pre-wrap mb-4">{space.brief}</p>}
          {!targetId && (
            <div className="flex gap-2 flex-wrap mb-4" aria-label="Member Cruxes">
              {space?.cruxIds.map((id) => {
                const crux = cruxes.find((c) => c.id === id);
                return crux ? (
                  <Button key={id} onClick={() => navigate(`/c/${id}`)}>
                    Open {crux.title || 'Untitled'}
                  </Button>
                ) : (
                  <span key={id} className="text-sm text-text-muted">
                    Unavailable Crux
                  </span>
                );
              })}
            </div>
          )}
          <h3 className="text-sm font-medium mb-2">Available outputs</h3>
          {assets.length === 0 ? (
            <p className="text-sm text-text-muted">
              No outputs yet. In OpenMosh, choose “Save output for Cruxspace”.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
              {assets.map((asset) => (
                <article
                  key={asset.id}
                  className="border border-border rounded-[var(--radius-sm)] p-3"
                >
                  <Thumbnail asset={asset} />
                  <h4 className="text-sm font-medium mt-2">{asset.label}</h4>
                  <p className="text-xs text-text-muted mb-2">
                    From {asset.sourceTitle} · {new Date(asset.created).toLocaleString()}
                  </p>
                  <Button
                    onClick={() => {
                      setUsing(asset);
                      setError('');
                      setReceiver(targetId ?? '');
                      setPath(`assets/cruxspace/${asset.id}.${asset.path.split('.').pop()}`);
                    }}
                  >
                    Use {asset.label}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-text-muted">
          {targetId
            ? 'Add this Crux to a Cruxspace in Home Garden to find related outputs.'
            : 'Create a Cruxspace for a website, its artwork and its plan. Each Crux keeps its own files and history.'}
        </p>
      )}
      {result && (
        <div
          role="status"
          className="mt-4 p-3 border border-border rounded-[var(--radius-sm)] text-sm"
        >
          <p>
            Copied {result.label} to <code>{result.path}</code>.
          </p>
          <p className="text-text-muted">
            This version is saved with its origin. Later source edits leave your copy intact.
          </p>
          {!targetId && (
            <Button onClick={() => navigate(`/c/${result.id}`)}>Open receiving Crux</Button>
          )}
        </div>
      )}
      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'Create Cruxspace' : 'Edit Cruxspace'}
        size="lg"
        onClose={() => {
          if (!busy) setEditing(null);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const input = { name, brief, cruxIds: members };
              const saved =
                editing === 'new'
                  ? await createCruxspace(input)
                  : await updateCruxspace((editing as Cruxspace).id, input);
              await load();
              setSelected(saved.id);
              setEditing(null);
            });
          }}
          className="space-y-4"
        >
          <label className="block text-sm">
            Cruxspace name
            <input
              className={field}
              value={name}
              maxLength={120}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Shared brief
            <textarea
              className={field}
              rows={3}
              value={brief}
              maxLength={8000}
              onChange={(e) => setBrief(e.target.value)}
            />
          </label>
          <fieldset>
            <legend className="text-sm mb-2">Member Cruxes</legend>
            <div className="max-h-52 overflow-y-auto space-y-2">
              {cruxes.map((c) => (
                <label key={c.id} className="flex gap-2 items-center text-sm">
                  <input
                    type="checkbox"
                    checked={members.includes(c.id)}
                    onChange={(e) =>
                      setMembers((ids) =>
                        e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.title || 'Untitled'}
                </label>
              ))}
              {members
                .filter((id) => !cruxes.some((c) => c.id === id))
                .map((id) => (
                  <label key={id} className="flex gap-2 items-center text-sm text-text-muted">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => setMembers((ids) => ids.filter((member) => member !== id))}
                    />
                    Unavailable Crux ({id.slice(0, 8)}) — uncheck to remove
                  </label>
                ))}
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-error text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-between gap-3">
            {editing && editing !== 'new' && (
              <Button
                type="button"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await deleteCruxspace(editing.id);
                    setEditing(null);
                    await load();
                  })
                }
              >
                Remove collection
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save Cruxspace'}
            </Button>
          </div>
          <p className="text-xs text-text-muted">
            Removing a member or collection keeps its Cruxes in your Garden.
          </p>
        </form>
      </Modal>
      <Modal
        open={using !== null}
        title="Use Cruxspace asset"
        layer="top"
        onClose={() => {
          if (!busy) setUsing(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              if (!using || !space) return;
              const used = await copyCruxspaceAsset({
                spaceId: space.id,
                outputId: using.id,
                fingerprint: using.fingerprint,
                sourceCruxId: using.sourceCruxId,
                targetCruxId: receiver,
                path,
              });
              setResult({ path: used.origin.path, id: receiver, label: using.label });
              setUsing(null);
            });
          }}
        >
          <p className="text-sm">
            Copy {using?.label} from {using?.sourceTitle}. Its source stays with the saved version.
          </p>
          {!targetId && (
            <label className="block text-sm">
              Receiving Crux
              <select
                required
                className={field}
                value={receiver}
                onChange={(e) => setReceiver(e.target.value)}
              >
                <option value="">Choose a Crux</option>
                {cruxes
                  .filter((c) => space?.cruxIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title || 'Untitled'}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            Image path
            <input
              required
              className={field}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          <p className="text-xs text-text-muted">
            For an Astro website, use public/assets/… and reference it on the page as /assets/….
          </p>
          {error && (
            <p role="alert" className="text-error text-sm">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Copying…' : 'Copy selected version'}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
