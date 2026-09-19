import { useState } from 'react';
import { Button, Toggle } from '@/components/ui';
import { useGardenStore } from '@/stores/gardenStore';
import {
  addSchedule,
  removeSchedule,
  setScheduleEnabled,
  useSchedules,
  type Repeat,
  type Schedule,
} from '@/services/schedules';

/**
 * Schedules on the Tending page (GARDEN-SCHEDULER-PLAN §2): the list of what
 * the garden will remind or nudge you about, and a small form to add one.
 * A reminder is a time, a message, an optional Crux and a repeat; a nudge is
 * a rule — a Crux untouched for N days. Both arrive as Alerts.
 */
function describe(s: Schedule, cruxTitle: (id?: string) => string): string {
  if (s.kind === 'remind') {
    const when = new Date(s.when).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return `${when}${s.repeat === 'daily' ? ', daily' : s.repeat === 'weekly' ? ', weekly' : ''}${
      s.cruxId ? ` · ${cruxTitle(s.cruxId)}` : ''
    }`;
  }
  return `${s.cruxId ? cruxTitle(s.cruxId) : 'Any Crux'} untouched for ${s.days} ${
    s.days === 1 ? 'day' : 'days'
  }`;
}

/** A local datetime-local value for "in an hour", the form's starting point. */
function inAnHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function SchedulesSection() {
  const schedules = useSchedules((s) => s.schedules);
  const cruxes = useGardenStore((s) => s.allCruxes);
  const cruxTitle = (id?: string) => cruxes.find((c) => c.id === id)?.title ?? 'a Crux';
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<'remind' | 'nudge'>('remind');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [when, setWhen] = useState(inAnHourLocal);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [days, setDays] = useState(7);
  const [cruxId, setCruxId] = useState('');

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    if (kind === 'remind') {
      const at = new Date(when);
      if (Number.isNaN(at.getTime())) return;
      addSchedule({
        kind: 'remind',
        title: t,
        body: body.trim(),
        when: at.toISOString(),
        repeat,
        ...(cruxId ? { cruxId } : {}),
      });
    } else {
      addSchedule({ kind: 'nudge', title: t, days, ...(cruxId ? { cruxId } : {}) });
    }
    setTitle('');
    setBody('');
    setAdding(false);
  };

  const field =
    'h-8 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs text-text';

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
            Reminders and nudges the garden raises as alerts. They run while the app is open; one
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
          className="grid gap-2 sm:grid-cols-[auto_1fr] items-center text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="schedule-kind" className="text-text-muted">
            Kind
          </label>
          <select
            id="schedule-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'remind' | 'nudge')}
            className={field}
          >
            <option value="remind">Remind me</option>
            <option value="nudge">Nudge me when a Crux sits untouched</option>
          </select>
          <label htmlFor="schedule-title" className="text-text-muted">
            Title
          </label>
          <input
            id="schedule-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === 'remind' ? 'Water the ferns' : 'Still growing?'}
            className={field}
            autoFocus
          />
          {kind === 'remind' ? (
            <>
              <label htmlFor="schedule-body" className="text-text-muted">
                Note
              </label>
              <input
                id="schedule-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Optional"
                className={field}
              />
              <label htmlFor="schedule-when" className="text-text-muted">
                When
              </label>
              <input
                id="schedule-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className={field}
              />
              <label htmlFor="schedule-repeat" className="text-text-muted">
                Repeat
              </label>
              <select
                id="schedule-repeat"
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as Repeat)}
                className={field}
              >
                <option value="none">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </>
          ) : (
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
                  onChange={(e) => setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))}
                  className={`${field} w-20`}
                />
                <span className="text-text-muted">days untouched</span>
              </div>
            </>
          )}
          <label htmlFor="schedule-crux" className="text-text-muted">
            Crux
          </label>
          <select
            id="schedule-crux"
            value={cruxId}
            onChange={(e) => setCruxId(e.target.value)}
            className={field}
          >
            <option value="">{kind === 'remind' ? 'None in particular' : 'Any Crux'}</option>
            {cruxes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <div className="sm:col-start-2 flex gap-2">
            <Button size="sm" type="submit" disabled={!title.trim()}>
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
              data-kind={s.kind}
              className="flex flex-wrap items-center gap-3 py-2"
            >
              <div className="flex-1 min-w-48">
                <p className="text-sm text-text">{s.title}</p>
                <p className="text-2xs text-text-muted">{describe(s, cruxTitle)}</p>
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
