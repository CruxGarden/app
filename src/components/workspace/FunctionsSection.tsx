import { useMemo, useState } from 'react';
import type { Artifact } from '@/api/types';
import { useCruxStore } from '@/stores/cruxStore';
import { Button, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  functionFiles,
  writeEventHandler,
  writeStarterFunction,
  callFunction,
  emitEvent,
  validateEventName,
  type WhenThen,
  type CallResult,
} from '@/services/crux-functions';
import { callLocalFunction, emitLocal } from '@/services/functions-runner';
import { useAppStore } from '@/stores/appStore';
import { PaneSection, PaneHint, PaneNote } from './pane-ui';

/**
 * The Functions block of the Share pane (CRUX-FUNCTIONS-PLAN F0 + F6): the
 * crux's backend. What `functions/` holds; a starter HTTP handler; the
 * When → Then rows that write an event handler without code; and Run and
 * Emit — here, against the local runner and Store, until the crux is shared,
 * then against the API as the signed-in person — the same calls the page
 * makes with `crux.fn` and `crux.emit`.
 */
export default function FunctionsSection({
  cruxId,
  artifacts,
  published,
  authenticated,
  changesToShare,
}: {
  cruxId: string;
  artifacts: Artifact[];
  published: boolean;
  authenticated: boolean;
  changesToShare: boolean;
}) {
  const refreshArtifacts = useCruxStore((s) => s.refreshArtifacts);
  const files = useMemo(() => functionFiles(artifacts), [artifacts]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, CallResult>>({});
  const [building, setBuilding] = useState(false);
  const [event, setEvent] = useState('');
  const [then, setThen] = useState<WhenThen['then']>({
    kind: 'store',
    key: '',
    value: 'event',
  });

  const act = async (label: string, work: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    setNote(null);
    try {
      setNote(await work());
    } catch (err) {
      setError((err as Error).message || `${label} failed.`);
    } finally {
      setBusy(null);
    }
  };

  const addStarter = () =>
    act('starter', async () => {
      const path = await writeStarterFunction(cruxId);
      await refreshArtifacts();
      return `Wrote ${path} and crux.js — add <script src="crux.js"></script> to the page and call crux.fn('hello').`;
    });

  const addRule = () =>
    act('rule', async () => {
      const problem = validateEventName(event);
      if (problem) throw new Error(problem);
      if (then.kind === 'store' && !then.key.trim()) throw new Error('Name the key to write.');
      if (then.kind === 'emit' && !then.event.trim()) throw new Error('Name the event to emit.');
      const path = await writeEventHandler(cruxId, { event: event.trim(), then });
      await refreshArtifacts();
      setBuilding(false);
      setEvent('');
      return `Wrote ${path}. It runs here on every emit, and at the address once shared.`;
    });

  const run = (name: string) =>
    act(`run:${name}`, async () => {
      const r = local
        ? await callLocalFunction(cruxId, name, {}, useAppStore.getState().author?.id ?? null)
        : await callFunction(cruxId, name, {});
      setResults((m) => ({ ...m, [name]: r }));
      return `${name} answered ${r.status}${r.ms !== null ? ` in ${r.ms} ms` : ''}${local ? ' here' : ' at the address'}.`;
    });

  const emit = (name: string) =>
    act(`emit:${name}`, async () => {
      const r = local
        ? await emitLocal(cruxId, name, {}, useAppStore.getState().author?.id ?? null)
        : await emitEvent(cruxId, name, {});
      for (const [handler, res] of Object.entries(r.results))
        setResults((m) => ({ ...m, [handler]: res }));
      return `${name} reached ${r.handlers} handler${r.handlers === 1 ? '' : 's'}${local ? ' here' : ' at the address'}.`;
    });

  const local = !published;
  const canCall = local || authenticated;
  const thenKind = then.kind;

  return (
    <PaneSection label="Functions" data-testid="functions-section">
      <div className="flex flex-col gap-2">
        {files.length === 0 ? (
          <PaneHint align="left">
            A backend for this crux: small handlers in <code className="font-mono">functions/</code>
            , run where it is shared, with its own Store. The page calls them with{' '}
            <code className="font-mono">crux.fn</code> and hears events with{' '}
            <code className="font-mono">crux.on</code>.
          </PaneHint>
        ) : (
          <ul className="flex flex-col gap-1.5" data-testid="functions-list">
            {files.map((f) => {
              const r = results[f.name];
              return (
                <li key={f.path} className="flex flex-col gap-1" data-testid={`function-${f.name}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-text truncate">{f.path}</span>
                    <span className="text-2xs text-text-muted">
                      {f.kind === 'event' ? `on "${f.event}"` : 'HTTP'}
                    </span>
                    <span className="flex-1" />
                    {canCall &&
                      (f.kind === 'http' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => void run(f.name)}
                        >
                          Run
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy !== null}
                          onClick={() => void emit(f.event!)}
                        >
                          Emit
                        </Button>
                      ))}
                  </div>
                  {r && (
                    <pre
                      className="text-2xs font-mono whitespace-pre-wrap rounded-[var(--radius-sm)] bg-input border border-input-border p-2 max-h-32 overflow-auto"
                      data-testid={`function-result-${f.name}`}
                    >
                      {r.status} {JSON.stringify(r.body, null, 1)}
                      {r.logs.length ? `\n— ${r.logs.join('\n— ')}` : ''}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {files.length > 0 && !canCall && (
          <PaneHint align="left">Connect your account to run them from here.</PaneHint>
        )}
        {files.length > 0 && local && (
          <PaneHint align="left">
            They run here, against this crux's local Store. Share the crux and they run at the
            address.
          </PaneHint>
        )}
        {files.length > 0 && canCall && changesToShare && (
          <PaneHint align="left">
            Changes to share: the address runs the last shared version.
          </PaneHint>
        )}

        <div className="flex flex-wrap gap-2">
          {!files.some((f) => f.name === 'hello') && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy !== null}
              onClick={() => void addStarter()}
            >
              Add a starter function
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => setBuilding((b) => !b)}
            aria-expanded={building}
          >
            {building ? 'Cancel' : 'When → Then…'}
          </Button>
        </div>

        {building && (
          <form
            className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border/60 p-2"
            data-testid="when-then"
            onSubmit={(e) => {
              e.preventDefault();
              void addRule();
            }}
          >
            <label className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
              <span className="text-text-muted">When</span>
              <Input
                aria-label="Event"
                placeholder="an event name — order, ping, or store:write"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
              />
            </label>
            <label className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
              <span className="text-text-muted">Then</span>
              <select
                aria-label="Then"
                value={thenKind}
                onChange={(e) => {
                  const kind = e.target.value as WhenThen['then']['kind'];
                  setThen(
                    kind === 'store'
                      ? { kind, key: '', value: 'event' }
                      : kind === 'emit'
                        ? { kind, event: '' }
                        : { kind },
                  );
                }}
                className="h-8 px-2 rounded-[var(--radius-sm)] bg-input border border-input-border text-text text-xs"
              >
                <option value="store">Write a Store key</option>
                <option value="emit">Emit another event</option>
                <option value="log">Log it</option>
              </select>
            </label>
            {then.kind === 'store' && (
              <div className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
                <span />
                <div className="flex gap-2">
                  <Input
                    aria-label="Key"
                    placeholder="key, e.g. last-order"
                    value={then.key}
                    onChange={(e) => setThen({ ...then, key: e.target.value })}
                    className="flex-1"
                  />
                  <select
                    aria-label="Value"
                    value={then.value === 'event' ? 'event' : 'text'}
                    onChange={(e) =>
                      setThen({ ...then, value: e.target.value === 'event' ? 'event' : '' })
                    }
                    className="h-8 px-2 rounded-[var(--radius-sm)] bg-input border border-input-border text-text text-xs"
                  >
                    <option value="event">the event's data</option>
                    <option value="text">a fixed value</option>
                  </select>
                </div>
                {then.value !== 'event' && (
                  <>
                    <span />
                    <Input
                      aria-label="Fixed value"
                      placeholder="the value to write"
                      value={then.value}
                      onChange={(e) => setThen({ ...then, value: e.target.value })}
                    />
                  </>
                )}
              </div>
            )}
            {then.kind === 'emit' && (
              <div className="grid grid-cols-[4rem_1fr] items-center gap-2 text-xs">
                <span />
                <Input
                  aria-label="Event to emit"
                  placeholder="the event to emit next"
                  value={then.event}
                  onChange={(e) => setThen({ ...then, event: e.target.value })}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" type="submit" disabled={busy !== null}>
                Add handler
              </Button>
              <span className={cn('text-2xs text-text-muted')}>
                Writes <code className="font-mono">functions/on-&lt;event&gt;.js</code>; edit it in
                Artifacts any time.
              </span>
            </div>
          </form>
        )}

        {note && (
          <span role="status" className="text-xxs text-text-muted">
            {note}
          </span>
        )}
        {error && <PaneNote tone="error">{error}</PaneNote>}
      </div>
    </PaneSection>
  );
}
