import { useState } from 'react';
import { Button, Toggle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useGardenStore } from '@/stores/gardenStore';
import {
  addSchedule,
  describeTrigger,
  removeSchedule,
  setScheduleEnabled,
  useSchedules,
  type Action,
  type Trigger,
} from '@/services/schedules';
import { cronError, describeCron } from '@/services/cron';
import { GARDEN_EVENTS, type GardenEventName } from '@/services/garden-events';
import { CUE_KINDS } from '@/services/cues';
import { CUE_GROUPS } from '@/audio/cue-presets';
import { defaultToolDefinitions } from '@/ai/tools';

/**
 * Schedules on the Tending page (GARDEN-SCHEDULER-PLAN §2): a cron for the
 * garden. Each schedule is a trigger — a time, an interval, a cron line, a
 * garden event, or a Crux left untouched — and the actions it runs: an
 * alert, a cue (an alarm), an OS notification, a prompt sent to a Crux, or a
 * garden tool called on one. The list shows what will happen and when.
 */
const ACTION_LABEL: Record<Action['kind'], string> = {
  alert: 'Alert',
  cue: 'Play a cue',
  notify: 'Notify',
  prompt: 'Send a prompt',
  tool: 'Run a tool',
};

function describeAction(a: Action, cruxTitle: (id?: string) => string): string {
  switch (a.kind) {
    case 'alert':
      return a.body?.trim() ? `Alert: ${a.body.trim()}` : 'Alert';
    case 'cue':
      return `Play ${typeof a.cue === 'string' ? (CUE_KINDS.find((k) => k.id === a.cue)?.label ?? a.cue) : 'your cue'}${
        a.times && a.times > 1 ? ` ×${a.times}` : ''
      }`;
    case 'notify':
      return 'Notify';
    case 'prompt':
      return `Prompt ${cruxTitle(a.cruxId)}`;
    case 'tool':
      return `${a.tool} on ${cruxTitle(a.cruxId)}`;
  }
}

/** A local datetime-local value for "in an hour", the form's starting point. */
function inAnHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const field =
  'h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs text-text';
const TOOL_NAMES = () =>
  defaultToolDefinitions()
    .map((t) => t.name)
    .filter((n) => n !== 'delegate')
    .sort();

export default function SchedulesSection() {
  const schedules = useSchedules((s) => s.schedules);
  const cruxes = useGardenStore((s) => s.allCruxes);
  const cruxTitle = (id?: string) => cruxes.find((c) => c.id === id)?.title ?? 'a Crux';
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  // Trigger
  const [kind, setKind] = useState<Trigger['kind']>('at');
  const [when, setWhen] = useState(inAnHourLocal);
  const [minutes, setMinutes] = useState(30);
  const [expr, setExpr] = useState('0 9 * * mon-fri');
  const [event, setEvent] = useState<GardenEventName>('snapshot');
  const [days, setDays] = useState(7);
  const [triggerCrux, setTriggerCrux] = useState('');

  // Actions
  const [actions, setActions] = useState<Action[]>([{ kind: 'alert', body: '' }]);
  const setAction = (i: number, a: Action) =>
    setActions((list) => list.map((x, j) => (j === i ? a : x)));
  const addAction = (k: Action['kind']) => {
    const first = cruxes[0]?.id ?? '';
    const blank: Record<Action['kind'], Action> = {
      alert: { kind: 'alert', body: '' },
      cue: { kind: 'cue', cue: 'ping', times: 1 },
      notify: { kind: 'notify' },
      prompt: { kind: 'prompt', cruxId: first, prompt: '' },
      tool: { kind: 'tool', cruxId: first, tool: 'list_files', input: {} },
    };
    setActions((list) => [...list, blank[k]]);
  };

  const trigger = (): Trigger => {
    switch (kind) {
      case 'at':
        return { kind: 'at', when: new Date(when).toISOString() };
      case 'every':
        return { kind: 'every', minutes };
      case 'cron':
        return { kind: 'cron', expr: expr.trim() };
      case 'event':
        return { kind: 'event', event, ...(triggerCrux ? { cruxId: triggerCrux } : {}) };
      case 'untouched':
        return { kind: 'untouched', days, ...(triggerCrux ? { cruxId: triggerCrux } : {}) };
    }
  };

  const submit = () => {
    setError('');
    try {
      if (kind === 'at' && Number.isNaN(new Date(when).getTime())) throw new Error('Pick a time.');
      if (kind === 'cron') {
        const e = cronError(expr);
        if (e) throw new Error(e);
      }
      addSchedule({ title: title.trim() || 'Schedule', trigger: trigger(), actions });
      setTitle('');
      setActions([{ kind: 'alert', body: '' }]);
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cruxSelect = (id: string, value: string, set: (v: string) => void, anyLabel: string) => (
    <select id={id} value={value} onChange={(e) => set(e.target.value)} className={field}>
      {anyLabel && <option value="">{anyLabel}</option>}
      {cruxes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </select>
  );

  return (
    <section
      aria-label="Schedules"
      data-testid="schedules"
      className="bg-panel border border-border rounded-[var(--radius)] p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base text-heading">Schedules</h2>
          <p className="text-xs text-text-muted">
            A cron for the garden: at a time, on an interval, on a cron line, when something
            happens, or when a Crux sits untouched — then alert, sound a cue, notify, send a prompt,
            or run a tool. They run while the app is open, or from the menu bar in docked mode; one
            that comes due while it is closed says so when you are back.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Schedule…'}
        </Button>
      </div>

      {adding && (
        <form
          data-testid="schedule-form"
          className="space-y-3 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[auto_1fr] items-center">
            <label htmlFor="schedule-title" className="text-text-muted">
              Title
            </label>
            <input
              id="schedule-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Water the ferns"
              className={field}
              autoFocus
            />
            <label htmlFor="schedule-kind" className="text-text-muted">
              When
            </label>
            <select
              id="schedule-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as Trigger['kind'])}
              className={field}
            >
              <option value="at">At a time (once)</option>
              <option value="every">Every N minutes (a timer)</option>
              <option value="cron">On a cron line</option>
              <option value="event">When something happens in the garden</option>
              <option value="untouched">When a Crux sits untouched</option>
            </select>
            {kind === 'at' && (
              <>
                <label htmlFor="schedule-when" className="text-text-muted">
                  Time
                </label>
                <input
                  id="schedule-when"
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className={field}
                />
              </>
            )}
            {kind === 'every' && (
              <>
                <label htmlFor="schedule-minutes" className="text-text-muted">
                  Every
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="schedule-minutes"
                    type="number"
                    min={1}
                    max={10080}
                    value={minutes}
                    onChange={(e) =>
                      setMinutes(Math.max(1, Math.min(10080, Number(e.target.value) || 1)))
                    }
                    className={`${field} w-24`}
                  />
                  <span className="text-text-muted">minutes</span>
                </div>
              </>
            )}
            {kind === 'cron' && (
              <>
                <label htmlFor="schedule-cron" className="text-text-muted">
                  Cron
                </label>
                <div className="flex flex-col gap-1">
                  <input
                    id="schedule-cron"
                    value={expr}
                    onChange={(e) => setExpr(e.target.value)}
                    placeholder="0 9 * * mon-fri"
                    className={`${field} font-mono`}
                  />
                  <span className="text-2xs text-text-muted" data-testid="cron-reading">
                    {cronError(expr) ??
                      `Reads: ${describeCron(expr)} (minute hour day month weekday)`}
                  </span>
                </div>
              </>
            )}
            {kind === 'event' && (
              <>
                <label htmlFor="schedule-event" className="text-text-muted">
                  Event
                </label>
                <select
                  id="schedule-event"
                  value={event}
                  onChange={(e) => setEvent(e.target.value as GardenEventName)}
                  className={field}
                >
                  {GARDEN_EVENTS.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            {kind === 'untouched' && (
              <>
                <label htmlFor="schedule-days" className="text-text-muted">
                  After
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="schedule-days"
                    type="number"
                    min={0}
                    max={365}
                    value={days}
                    onChange={(e) =>
                      setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))
                    }
                    className={`${field} w-20`}
                  />
                  <span className="text-text-muted">days untouched</span>
                </div>
              </>
            )}
            {(kind === 'event' || kind === 'untouched') && (
              <>
                <label htmlFor="schedule-crux" className="text-text-muted">
                  Crux
                </label>
                {cruxSelect('schedule-crux', triggerCrux, setTriggerCrux, 'Any Crux')}
              </>
            )}
          </div>

          <div className="space-y-2" data-testid="schedule-actions">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-text-muted">Then</span>
              {(Object.keys(ACTION_LABEL) as Action['kind'][]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => addAction(k)}
                  className="px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:text-text hover:border-accent cursor-pointer"
                >
                  + {ACTION_LABEL[k]}
                </button>
              ))}
            </div>
            {actions.map((a, i) => (
              <div
                key={i}
                data-testid="schedule-action"
                data-kind={a.kind}
                className="grid gap-2 sm:grid-cols-[auto_1fr_auto] items-start rounded-[var(--radius-sm)] border border-border/60 p-2"
              >
                <span className="text-text pt-1.5 w-24">{ACTION_LABEL[a.kind]}</span>
                <div className="flex flex-col gap-1.5">
                  {a.kind === 'alert' && (
                    <input
                      aria-label={`Alert note ${i + 1}`}
                      value={a.body ?? ''}
                      onChange={(e) => setAction(i, { ...a, body: e.target.value })}
                      placeholder="A note with the alert (optional)"
                      className={field}
                    />
                  )}
                  {a.kind === 'cue' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Cue ${i + 1}`}
                        value={typeof a.cue === 'string' ? a.cue : ''}
                        onChange={(e) => setAction(i, { ...a, cue: e.target.value })}
                        className={field}
                      >
                        {CUE_GROUPS.map((g) => (
                          <optgroup key={g.id} label={g.label}>
                            {CUE_KINDS.filter((k) => k.group === g.id).map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-text-muted">
                        <input
                          aria-label={`Cue times ${i + 1}`}
                          type="number"
                          min={1}
                          max={10}
                          value={a.times ?? 1}
                          onChange={(e) =>
                            setAction(i, {
                              ...a,
                              times: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
                            })
                          }
                          className={`${field} w-16`}
                        />
                        times
                      </label>
                    </div>
                  )}
                  {a.kind === 'notify' && (
                    <span className="text-text-muted pt-1.5">
                      A desktop notification with the title and the reason.
                    </span>
                  )}
                  {a.kind === 'prompt' && (
                    <>
                      {cruxSelect(
                        `schedule-prompt-crux-${i}`,
                        a.cruxId,
                        (v) => setAction(i, { ...a, cruxId: v }),
                        '',
                      )}
                      <textarea
                        aria-label={`Prompt ${i + 1}`}
                        value={a.prompt}
                        onChange={(e) => setAction(i, { ...a, prompt: e.target.value })}
                        placeholder="Summarise this week's changes into NOTES.md"
                        rows={2}
                        className={cn(field, 'h-auto py-1.5')}
                      />
                    </>
                  )}
                  {a.kind === 'tool' && (
                    <>
                      {cruxSelect(
                        `schedule-tool-crux-${i}`,
                        a.cruxId,
                        (v) => setAction(i, { ...a, cruxId: v }),
                        '',
                      )}
                      <select
                        aria-label={`Tool ${i + 1}`}
                        value={a.tool}
                        onChange={(e) => setAction(i, { ...a, tool: e.target.value })}
                        className={`${field} font-mono`}
                      >
                        {TOOL_NAMES().map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <textarea
                        aria-label={`Tool input ${i + 1}`}
                        defaultValue={JSON.stringify(a.input)}
                        onBlur={(e) => {
                          try {
                            const parsed = JSON.parse(e.target.value || '{}') as Record<
                              string,
                              unknown
                            >;
                            setAction(i, { ...a, input: parsed });
                            setError('');
                          } catch {
                            setError(`Tool input ${i + 1} must be JSON.`);
                          }
                        }}
                        rows={2}
                        className={cn(field, 'h-auto py-1.5 font-mono')}
                      />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Remove action ${i + 1}`}
                  onClick={() => setActions((list) => list.filter((_, j) => j !== i))}
                  disabled={actions.length <= 1}
                  className="text-text-muted hover:text-error disabled:opacity-40 px-1 cursor-pointer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {error && (
            <p className="text-error" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" type="submit">
              Add
            </Button>
          </div>
        </form>
      )}

      {schedules.length === 0 ? (
        <p className="text-xs text-text-muted">Nothing scheduled.</p>
      ) : (
        <ul className="divide-y divide-border">
          {schedules.map((s) => (
            <li
              key={s.id}
              data-testid="schedule"
              data-kind={s.trigger.kind}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <div className="flex-1 min-w-48">
                <p className="text-sm text-text">{s.title}</p>
                <p className="text-2xs text-text-muted">
                  {s.trigger.kind === 'cron'
                    ? describeCron(s.trigger.expr)
                    : describeTrigger(s.trigger, cruxTitle)}
                  {s.next && s.enabled && (
                    <>
                      {' '}
                      · next{' '}
                      {new Date(s.next).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </>
                  )}
                </p>
                <p className="text-2xs text-text-muted">
                  {s.actions.map((a) => describeAction(a, cruxTitle)).join(' · ')}
                </p>
              </div>
              <Toggle
                checked={s.enabled}
                onChange={(v) => setScheduleEnabled(s.id, v)}
                label={s.enabled ? 'On' : 'Off'}
              />
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove schedule ${s.title}`}
                onClick={() => removeSchedule(s.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
