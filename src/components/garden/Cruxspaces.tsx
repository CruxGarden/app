import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/components/ui';
import { getServices } from '@/services';
import type { Crux } from '@/api/types';
import { useBlobUrl } from '@/hooks/useBlobUrl';
import {
  CRUXSPACES_CHANGED,
  getCruxspace,
  listCruxspaces,
  type Cruxspace,
} from '@/services/cruxspaces';
import {
  listCruxspaceAssets,
  copyCruxspaceAsset,
  outputKind,
  type CruxspaceAsset,
} from '@/services/cruxspace-assets';
import { findWorkingCopy } from '@/services/working-copies';
import { getSqliteClient } from '@/services/sqlite/client';
import { exportCruxspace } from '@/services/cruxspace-package';
import {
  CRUXSPACE_MOMENT_CHANGED,
  getCruxspaceMoment,
  setCruxspaceMoment,
} from '@/services/cruxspace-moment';
import { startCruxspaceWalk } from '@/stores/cruxspaceWalk';

const CruxspaceStory = lazy(() => import('./CruxspaceStory'));
const field = 'w-full rounded-[var(--radius-sm)] border border-border bg-bg p-2 text-sm text-text';
function Thumbnail({ asset }: { asset: CruxspaceAsset }) {
  const url = useBlobUrl(asset.fingerprint, asset.mimeType);
  const kind = outputKind(asset.mimeType);
  if (kind !== 'image')
    return (
      <div
        className="h-28 bg-bg rounded-[var(--radius-sm)] flex items-center justify-center text-sm text-text-muted"
        aria-label={`${kind} output`}
      >
        {kind === 'audio' ? 'Audio' : 'Bundle'} · {asset.path.split('.').pop()!.toUpperCase()} ·{' '}
        {Math.max(1, Math.round(asset.size / 1024))} KB
      </div>
    );
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

/**
 * A Garden's shared work: its walkthrough, the outputs its Cruxes offer each
 * other, its history and its package. On Garden Home (`gardenId`) it is that
 * Garden's quiet footer; in a Workshop (`targetId`) it offers the outputs of
 * the Garden the Crux grows in.
 */
export default function Cruxspaces({
  gardenId,
  targetId,
  runOperation = (operation) => operation(),
}: {
  gardenId?: string;
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
  const [using, setUsing] = useState<CruxspaceAsset | null>(null);
  const [receiver, setReceiver] = useState('');
  const [path, setPath] = useState('');
  const [unpack, setUnpack] = useState(false);
  const [result, setResult] = useState<{ path: string; id: string; label: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [status, setStatus] = useState('');
  const [story, setStory] = useState(false);
  const [moment, setMoment] = useState(getCruxspaceMoment);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    startCruxspaceWalk(); // background workspaces follow the walk even when none is on screen
    const update = () => setMoment(getCruxspaceMoment());
    window.addEventListener(CRUXSPACE_MOMENT_CHANGED, update);
    return () => window.removeEventListener(CRUXSPACE_MOMENT_CHANGED, update);
  }, []);
  const space = spaces.find((s) => s.id === selected);
  const load = useCallback(async () => {
    const [all, live, copy] = await Promise.all([
      gardenId ? getCruxspace(gardenId).then((g) => [g]) : listCruxspaces(),
      getServices().crux.listAll(),
      targetId ? findWorkingCopy(targetId) : null,
    ]);
    const visible = targetId
      ? all.filter((s) => s.cruxIds.includes(copy?.cruxId ?? targetId))
      : all;
    setSpaces(visible);
    setCruxes(live);
    setSelected((id) => (visible.some((s) => s.id === id) ? id : (visible[0]?.id ?? '')));
  }, [gardenId, targetId]);
  // A member saving a new output shows it here without asking.
  useEffect(
    () =>
      getSqliteClient().onChange?.((change) => {
        if (
          change.entity === 'crux' &&
          change.fields?.includes('fileContent') &&
          spaces.some((s) => s.cruxIds.includes(change.id ?? ''))
        )
          setRefresh((n) => n + 1);
      }),
    [spaces],
  );
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
      setStatus('');
    } finally {
      setBusy(false);
    }
  };
  const exportPackage = () =>
    action(async () => {
      if (!space) return;
      setStatus(`Packing ${space.name}…`);
      const result = await exportCruxspace({ spaceId: space.id, onProgress: setStatus });
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatus(
        result.failed.length
          ? `Exported ${result.filename}; ${result.failed.length} item(s) could not be included.`
          : `Exported ${result.filename} with ${result.manifest.members.length} member Cruxes.`,
      );
    });
  const quiet = 'text-xs text-accent hover:underline cursor-pointer disabled:opacity-50';
  // Garden Home shows this only once the Garden has Cruxes to share between.
  if (gardenId && !space?.cruxIds.length) return null;
  return (
    <section
      ref={section}
      aria-label={gardenId ? 'Garden work' : 'Garden outputs'}
      className={
        gardenId
          ? 'mt-6 text-text'
          : 'bg-panel border border-border rounded-[var(--radius)] p-4 mb-6 text-text'
      }
    >
      {targetId && (
        <div className="mb-3">
          <h2 className="font-display text-lg">
            {space ? `Outputs from ${space.name}` : 'Garden outputs'}
          </h2>
          <p className="text-sm text-text-muted">
            Ready-to-use images, sounds and bundles from the other Cruxes in this Garden.
          </p>
        </div>
      )}
      {status && !using && (
        <p role="status" className="text-sm text-text-muted mb-3">
          {status}
        </p>
      )}
      {error && !using && (
        <p role="alert" className="text-error text-sm mb-3">
          {error}
        </p>
      )}
      {space ? (
        <>
          {targetId && spaces.length > 1 && (
            <select
              aria-label="Garden"
              className={`${field} mb-3`}
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
          )}
          {moment && moment.spaceId === selected && (
            <p
              role="status"
              aria-label="Walkthrough"
              className="text-sm mb-4 flex flex-wrap items-center gap-2"
            >
              <span>
                Walking through {moment.spaceName} · step {moment.step} of {moment.steps}:{' '}
                {moment.title}. Its Cruxes open read-only at that moment.
              </span>
              <Button onClick={() => setCruxspaceMoment(null)}>Back to now</Button>
            </p>
          )}
          {assets.length > 0 ? (
            <>
              <h3 className="text-sm font-medium mb-2">Outputs</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto mb-3">
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
                        setUnpack(false);
                        setPath(`assets/cruxspace/${asset.id}.${asset.path.split('.').pop()}`);
                      }}
                    >
                      Use {asset.label}
                    </Button>
                  </article>
                ))}
              </div>
            </>
          ) : (
            targetId && (
              <p className="text-sm text-text-muted mb-3">
                No outputs yet. Save an image, sound or bundle to the Garden from another Crux, for
                example “Save sheet to Garden” in Piskel.
              </p>
            )
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button type="button" className={quiet} onClick={() => setStory(true)}>
              History
            </button>
            {gardenId && (
              <button
                type="button"
                className={quiet}
                disabled={busy}
                onClick={() => void exportPackage()}
              >
                Export Garden
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-text-muted">
          Place this Crux in a Garden with other Cruxes to share their outputs.
        </p>
      )}
      {story && space && (
        <Suspense fallback={null}>
          <CruxspaceStory spaceId={space.id} onClose={() => setStory(false)} />
        </Suspense>
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
        open={using !== null}
        title="Use an output"
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
                unpack,
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
          {using && outputKind(using.mimeType) === 'bundle' && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={unpack}
                onChange={(e) => {
                  setUnpack(e.target.checked);
                  setPath(
                    e.target.checked
                      ? `assets/cruxspace/${using.id}`
                      : `assets/cruxspace/${using.id}.zip`,
                  );
                }}
              />
              Unpack the bundle into a folder
            </label>
          )}
          <label className="block text-sm">
            {unpack ? 'Destination folder' : 'Destination path'}
            <input
              required
              className={field}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          <p className="text-xs text-text-muted">
            For an Astro website, use public/assets/… (or public/game for an unpacked game) and
            reference it on the page as /assets/… (or /game/index.html).
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
