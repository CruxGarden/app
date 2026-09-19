import { useEffect, useState } from 'react';
import { Button, Toggle } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useGardenStore } from '@/stores/gardenStore';
import {
  TIMER_PRESETS,
  addSchedule,
  describeTrigger,
  formatRemaining,
  moodSchedulesEnabled,
  pauseTimer,
  removeSchedule,
  resetTimer,
  setMoodSchedulesEnabled,
  setScheduleEnabled,
  setScheduleSource,
  startTimer,
  timerRemaining,
  useSchedules,
  type Action,
  type Schedule,
  type TimerPhase,
  type Trigger,
} from '@/services/schedules';
import { cronError, describeCron } from '@/services/cron';
import { GARDEN_EVENTS, type GardenEventName } from '@/services/garden-events';
import { CUE_KINDS } from '@/services/cues';
import { CUE_GROUPS } from '@/audio/cue-presets';
import { defaultToolDefinitions } from '@/ai/tools';
import { BUNDLED_MOODS } from '@/lib/moods/bundled-moods';
import { getInstalledMoods, onMoodPackagesChange } from '@/lib/moods/packages';
import { getSetting } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import {
  WEATHER_KINDS,
  describeWeather,
  geocode,
  getLocation,
  getWeather,
  locateHere,
  setLocation,
  type Location,
  type WeatherKind,
} from '@/services/weather';

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
  mood: 'Wear a Mood',
};

const allMoods = () => [
  ...BUNDLED_MOODS.map((m) => ({ id: m.id, name: m.name })),
  ...getInstalledMoods().map((m) => ({ id: m.id, name: m.name })),
];

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
    case 'mood':
      return `Wear ${allMoods().find((m) => m.id === a.moodId)?.name ?? a.moodId}`;
  }
}

/** A running timer's phase and countdown; re-renders each second. */
function TimerControls({ s }: { s: Schedule }) {
  const [now, setNow] = useState(() => Date.now());
  const running = !!s.timer?.running;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (s.trigger.kind !== 'timer') return null;
  const left = timerRemaining(s, new Date(now));
  const phase = s.timer ? s.trigger.phases[s.timer.phase] : null;
  return (
    <div className="flex items-center gap-2" data-testid="timer-controls">
      {left !== null && phase && (
        <span className="font-mono text-xs text-accent" data-testid="timer-remaining">
          {phase.label} {formatRemaining(left)}
          {s.trigger.rounds > 1 && (
            <span className="text-text-muted">
              {' '}
              · round {(s.timer?.round ?? 0) + 1}/{s.trigger.rounds}
            </span>
          )}
        </span>
      )}
      {running ? (
        <Button size="sm" variant="secondary" onClick={() => pauseTimer(s.id)}>
          Pause
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => startTimer(s.id)}
          disabled={!s.enabled}
        >
          {s.timer ? 'Resume' : 'Start'}
        </Button>
      )}
      {s.timer && (
        <Button size="sm" variant="ghost" onClick={() => resetTimer(s.id)}>
          Reset
        </Button>
      )}
    </div>
  );
}

/** Where the garden is, for the weather: a place typed, or "use my location". */
function LocationRow() {
  const [loc, setLoc] = useState<Location | null>(() => getLocation());
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const weather = getWeather();
  const pick = (l: Location | null) => {
    setLocation(l);
    setLoc(l);
    setFound([]);
    setQuery('');
  };
  const search = async () => {
    setBusy(true);
    setError('');
    try {
      const list = await geocode(query.trim());
      if (!list.length) setError('No place by that name.');
      setFound(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const here = async () => {
    setBusy(true);
    setError('');
    try {
      pick(await locateHere());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid="weather-location">
      {loc ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text">{loc.name}</span>
          {weather && <span className="text-text-muted">{describeWeather(weather)}</span>}
          <button
            type="button"
            onClick={() => pick(null)}
            className="text-text-muted hover:text-text underline cursor-pointer"
          >
            change
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Place"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="A town or city"
            className={cn(field, 'w-48')}
          />
          <Button size="sm" variant="secondary" onClick={search} disabled={busy || !query.trim()}>
            Find
          </Button>
          <Button size="sm" variant="ghost" onClick={here} disabled={busy}>
            Use my location
          </Button>
        </div>
      )}
      {found.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {found.map((l) => (
            <li key={`${l.lat},${l.lon}`}>
              <button
                type="button"
                onClick={() => pick(l)}
                className="px-2 py-0.5 rounded-[var(--radius-sm)] border border-border hover:border-accent cursor-pointer"
              >
                {l.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <span className="text-error">{error}</span>}
      <span className="text-2xs text-text-muted">
        Checked every quarter hour from Open-Meteo while a weather schedule is on; nothing else is
        sent.
      </span>
    </div>
  );
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
  const [phases, setPhases] = useState<TimerPhase[]>(TIMER_PRESETS[0]!.phases);
  const [rounds, setRounds] = useState(TIMER_PRESETS[0]!.rounds);
  const [startOn, setStartOn] = useState<GardenEventName | ''>('');
  const [condition, setCondition] = useState<WeatherKind | 'any'>('any');
  const [forMood, setForMood] = useState(false);
  const wornMoodId = (getSetting(SettingsKey.WornMoodId) as string | null) || '';
  const [moodsOn, setMoodsOn] = useState(moodSchedulesEnabled);
  const [, bump] = useState(0);
  useEffect(() => onMoodPackagesChange(() => bump((n) => n + 1)), []);
  const moods = allMoods();

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
      mood: { kind: 'mood', moodId: moods[0]?.id ?? 'plasma' },
    };
    setActions((list) => [...list, blank[k]]);
  };
  const setPhase = (i: number, patch: Partial<TimerPhase>) =>
    setPhases((list) => list.map((p, j) => (j === i ? { ...p, ...patch } : p)));

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
      case 'timer':
        return { kind: 'timer', phases, rounds, ...(startOn ? { startOn } : {}) };
      case 'weather':
        return { kind: 'weather', condition };
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
      if (kind === 'timer' && phases.some((p) => !p.label.trim() || !(p.minutes > 0)))
        throw new Error('Every phase needs a name and some minutes.');
      addSchedule({
        title: title.trim() || 'Schedule',
        trigger: trigger(),
        actions,
        ...(forMood && wornMoodId ? { source: 'mood', moodId: wornMoodId } : {}),
      });
      setTitle('');
      setActions([{ kind: 'alert', body: '' }]);
      setForMood(false);
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
            A cron for the garden: at a time, on an interval, on a cron line, a timer with phases,
            when something happens, when the weather turns, or when a Crux sits untouched — then
            alert, sound a cue, notify, wear a Mood, send a prompt, or run a tool. They run while
            the app is open, or from the menu bar in docked mode; one that comes due while it is
            closed says so when you are back.
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
              <option value="every">Every N minutes</option>
              <option value="cron">On a cron line</option>
              <option value="timer">A timer with phases (a pomodoro)</option>
              <option value="event">When something happens in the garden</option>
              <option value="weather">When the weather turns</option>
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
            {kind === 'timer' && (
              <>
                <label htmlFor="schedule-timer-preset" className="text-text-muted">
                  Preset
                </label>
                <select
                  id="schedule-timer-preset"
                  defaultValue={TIMER_PRESETS[0]!.id}
                  onChange={(e) => {
                    const p = TIMER_PRESETS.find((x) => x.id === e.target.value);
                    if (p) {
                      setPhases(p.phases.map((ph) => ({ ...ph })));
                      setRounds(p.rounds);
                    }
                  }}
                  className={field}
                >
                  {TIMER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <span className="text-text-muted">Phases</span>
                <div className="flex flex-col gap-1.5" data-testid="timer-phases">
                  {phases.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        aria-label={`Phase ${i + 1} name`}
                        value={p.label}
                        onChange={(e) => setPhase(i, { label: e.target.value })}
                        className={cn(field, 'w-32')}
                      />
                      <input
                        aria-label={`Phase ${i + 1} minutes`}
                        type="number"
                        min={1}
                        max={1440}
                        value={p.minutes}
                        onChange={(e) =>
                          setPhase(i, {
                            minutes: Math.max(1, Math.min(1440, Number(e.target.value) || 1)),
                          })
                        }
                        className={cn(field, 'w-20')}
                      />
                      <span className="text-text-muted">min</span>
                      <button
                        type="button"
                        aria-label={`Remove phase ${i + 1}`}
                        onClick={() => setPhases((list) => list.filter((_, j) => j !== i))}
                        disabled={phases.length <= 1}
                        className="text-text-muted hover:text-error disabled:opacity-40 px-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {phases.length < 8 && (
                    <button
                      type="button"
                      onClick={() => setPhases((list) => [...list, { label: 'Phase', minutes: 5 }])}
                      className="self-start px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-text-muted hover:text-text hover:border-accent cursor-pointer"
                    >
                      + Phase
                    </button>
                  )}
                </div>
                <label htmlFor="schedule-rounds" className="text-text-muted">
                  Rounds
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="schedule-rounds"
                    type="number"
                    min={0}
                    max={99}
                    value={rounds}
                    onChange={(e) =>
                      setRounds(Math.max(0, Math.min(99, Number(e.target.value) || 0)))
                    }
                    className={`${field} w-20`}
                  />
                  <span className="text-text-muted">0 repeats until you stop it</span>
                </div>
                <label htmlFor="schedule-start-on" className="text-text-muted">
                  Starts
                </label>
                <select
                  id="schedule-start-on"
                  value={startOn}
                  onChange={(e) => setStartOn(e.target.value as GardenEventName | '')}
                  className={field}
                >
                  <option value="">When you press Start</option>
                  {GARDEN_EVENTS.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      Itself, when {ev.label.charAt(0).toLowerCase() + ev.label.slice(1)}
                    </option>
                  ))}
                </select>
              </>
            )}
            {kind === 'weather' && (
              <>
                <label htmlFor="schedule-weather" className="text-text-muted">
                  Turns
                </label>
                <select
                  id="schedule-weather"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as WeatherKind | 'any')}
                  className={field}
                >
                  {WEATHER_KINDS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <span className="text-text-muted">Place</span>
                <LocationRow />
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
                  {a.kind === 'mood' && (
                    <select
                      aria-label={`Mood ${i + 1}`}
                      value={a.moodId}
                      onChange={(e) => setAction(i, { ...a, moodId: e.target.value })}
                      className={field}
                    >
                      {moods.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
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
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" type="submit">
              Add
            </Button>
            {wornMoodId && (
              <label className="flex items-center gap-1.5 text-text-muted">
                <input
                  type="checkbox"
                  checked={forMood}
                  onChange={(e) => setForMood(e.target.checked)}
                />
                Travels with the Mood
              </label>
            )}
          </div>
        </form>
      )}

      {schedules.some((s) => s.source === 'mood') && (
        <div className="flex items-center justify-between gap-2 text-xs" data-testid="mood-switch">
          <span className="text-text-muted">
            Schedules the worn Mood brings along run too. They go when the Mood goes.
          </span>
          <Toggle
            checked={moodsOn}
            onChange={(v) => {
              setMoodSchedulesEnabled(v);
              setMoodsOn(v);
            }}
            label="Let the Mood schedule"
          />
        </div>
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
              data-source={s.source ?? 'garden'}
              className={cn(
                'flex flex-wrap items-center gap-3 py-2',
                s.source === 'mood' && !moodsOn && 'opacity-60',
              )}
            >
              <div className="flex-1 min-w-48">
                <p className="text-sm text-text">
                  {s.title}
                  {s.source === 'mood' && (
                    <button
                      type="button"
                      title="From the worn Mood — click to keep it in the garden instead"
                      onClick={() => setScheduleSource(s.id, undefined)}
                      className="ml-2 align-middle text-3xs uppercase tracking-wider text-accent border border-accent/40 rounded-full px-1.5 cursor-pointer"
                    >
                      Mood
                    </button>
                  )}
                </p>
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
              {s.trigger.kind === 'timer' && <TimerControls s={s} />}
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
