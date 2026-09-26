import type { Crux } from '@/api/types';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { TIMER_PRESETS, addSchedule, type Action, type TimerPhase, type Trigger } from '@/services/schedules';
import { cronError, describeCron } from '@/services/cron';
import { GARDEN_EVENTS, type GardenEventName } from '@/services/garden-events';
import { CUE_KINDS } from '@/services/cues';
import { CUE_GROUPS } from '@/audio/cue-presets';
import { defaultToolDefinitions } from '@/ai/tools';
import { allMoods } from './schedule-moods';
import { onMoodPackagesChange, refreshInstalledMoods } from '@/lib/moods/packages';
import { getSetting, onSettingChange } from '@/services/settings';
import { SettingsKey } from '@/lib/constants';
import {
  WEATHER_KINDS,
  describeWeather,
  getLocation,
  getWeather,
  getWeatherUrl,
  locateHere,
  setLocation,
  setWeatherUrl,
  type Location,
  type WeatherKind,
  WEATHER_KEY,
  WEATHER_ERROR_KEY,
  getWeatherError,
} from '@/services/weather';
import { SUN_PHASES, sunTimes, type SunPhase } from '@/services/sun';

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
  fn: 'Call a function',
};

/** Where the garden is: latitude and longitude typed, or the device's own location. Nothing is looked up anywhere. */
function LocationRow({ children }: { children?: ReactNode }) {
  const [loc, setLoc] = useState<Location | null>(() => getLocation());
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = (l: Location | null) => {
    setLocation(l);
    setLoc(l);
    setError('');
  };
  const typed = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180)
      return setError('Latitude −90…90 and longitude −180…180.');
    pick({ name: name.trim() || `${la.toFixed(2)}, ${lo.toFixed(2)}`, lat: la, lon: lo });
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
    <div className="flex flex-col gap-1.5" data-testid="garden-location">
      {loc ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text">{loc.name}</span>
          <span className="text-text-muted">
            {loc.lat.toFixed(2)}, {loc.lon.toFixed(2)}
          </span>
          {children}
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
          <Input
            aria-label="Place name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
            fieldSize="sm" className={'w-36'}
          />
          <Input
            aria-label="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="Latitude"
            inputMode="decimal"
            fieldSize="sm" className={'w-24'}
          />
          <Input
            aria-label="Longitude"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            placeholder="Longitude"
            inputMode="decimal"
            fieldSize="sm" className={'w-24'}
          />
          <Button size="sm" variant="secondary" onClick={typed} disabled={!lat || !lon}>
            Set
          </Button>
          <Button size="sm" variant="ghost" onClick={here} disabled={busy}>
            Use my location
          </Button>
        </div>
      )}
      {error && <span className="text-error">{error}</span>}
    </div>
  );
}

/** The person's own weather endpoint — nothing is built in. */
function WeatherSourceRow() {
  const [url, setUrl] = useState(getWeatherUrl);
  const [, bump] = useState(0);
  useEffect(
    () =>
      onSettingChange((key) => {
        if (key === WEATHER_KEY || key === WEATHER_ERROR_KEY) bump((n) => n + 1);
      }),
    [],
  );
  const weather = getWeather();
  const problem = getWeatherError();
  return (
    <div className="flex flex-col gap-1.5" data-testid="weather-source">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Weather endpoint"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setWeatherUrl(url)}
          placeholder="https://your-station.local/weather"
          fieldSize="sm" className={'w-80 font-mono'}
        />
        {weather && <span className="text-text-muted">{describeWeather(weather)}</span>}
        {problem && (
          <span role="alert" className="text-error" data-testid="weather-error">
            {problem}
          </span>
        )}
      </div>
      <span className="text-2xs text-text-muted">
        Yours to run: it is asked <code>?lat=&lon=</code> every quarter hour while a weather
        schedule is on and answers JSON like{' '}
        <code>{'{ "kind": "rain", "temperature": 12.5, "day": true }'}</code> (a WMO{' '}
        <code>code</code> works in place of <code>kind</code>). No service is built in.
      </span>
    </div>
  );
}

/** Today's sun at the place, so the person can see what the trigger means. */
function SunToday() {
  const loc = getLocation();
  if (!loc) return null;
  const t = sunTimes(new Date(), loc.lat, loc.lon);
  const fmt = (d: Date | null) => (d ? d.toLocaleTimeString([], { timeStyle: 'short' }) : '—');
  return (
    <span className="text-text-muted" data-testid="sun-today">
      today: dawn {fmt(t.dawn)} · sunrise {fmt(t.sunrise)} · sunset {fmt(t.sunset)} · dusk{' '}
      {fmt(t.dusk)}
    </span>
  );
}

/** A local datetime-local value for "in an hour", the form's starting point. */
function inAnHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


const TOOL_NAMES = () =>
  defaultToolDefinitions()
    .map((t) => t.name)
    .filter((n) => n !== 'delegate')
    .sort();

/**
 * The new-schedule form: a title, one trigger (a time, an interval, a cron
 * line, a timer with phases, sun, an event, the weather, or a Crux left
 * untouched) and the actions it fires. `onDone` closes it after a save.
 */
export default function ScheduleForm({
  gardenId,
  cruxes,
  onDone,
}: {
  gardenId: string | undefined;
  cruxes: Crux[];
  onDone: () => void;
}) {
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
  const [sunPhase, setSunPhase] = useState<SunPhase>('sunset');
  const [forMood, setForMood] = useState(false);
  const wornMoodId = (getSetting(SettingsKey.WornMoodId) as string | null) || '';
  const [, bump] = useState(0);
  useEffect(() => onMoodPackagesChange(() => bump((n) => n + 1)), []);
  useEffect(() => {
    let active = true;
    void refreshInstalledMoods(gardenId).catch((error) => {
      if (active) setError(error instanceof Error ? error.message : 'Could not load Moods.');
    });
    return () => {
      active = false;
    };
  }, [gardenId]);
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
      fn: { kind: 'fn', cruxId: first, name: 'hello', input: {} },
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
      case 'sun':
        return { kind: 'sun', phase: sunPhase };
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
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const cruxSelect = (id: string, value: string, set: (v: string) => void, anyLabel: string) => (
    <Select id={id} value={value} onChange={(e) => set(e.target.value)} fieldSize="sm">
      {anyLabel && <option value="">{anyLabel}</option>}
      {cruxes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.title}
        </option>
      ))}
    </Select>
  );

  return (
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
        <Input
          id="schedule-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Water the ferns"
          fieldSize="sm"
          autoFocus
        />
        <label htmlFor="schedule-kind" className="text-text-muted">
          When
        </label>
        <Select
          id="schedule-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as Trigger['kind'])}
          fieldSize="sm"
        >
          <option value="at">At a time (once)</option>
          <option value="every">Every N minutes</option>
          <option value="cron">On a cron line</option>
          <option value="timer">A timer with phases (a pomodoro)</option>
          <option value="event">When something happens in the garden</option>
          <option value="sun">At dawn, sunrise, sunset or dusk</option>
          <option value="weather">When the weather turns</option>
          <option value="untouched">When a Crux sits untouched</option>
        </Select>
        {kind === 'at' && (
          <>
            <label htmlFor="schedule-when" className="text-text-muted">
              Time
            </label>
            <Input
              id="schedule-when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              fieldSize="sm"
            />
          </>
        )}
        {kind === 'every' && (
          <>
            <label htmlFor="schedule-minutes" className="text-text-muted">
              Every
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="schedule-minutes"
                type="number"
                min={1}
                max={10080}
                value={minutes}
                onChange={(e) =>
                  setMinutes(Math.max(1, Math.min(10080, Number(e.target.value) || 1)))
                }
                fieldSize="sm" className="w-24"
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
              <Input
                id="schedule-cron"
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                placeholder="0 9 * * mon-fri"
                fieldSize="sm" className="font-mono"
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
            <Select
              id="schedule-event"
              value={event}
              onChange={(e) => setEvent(e.target.value as GardenEventName)}
              fieldSize="sm"
            >
              {GARDEN_EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.label}
                </option>
              ))}
            </Select>
          </>
        )}
        {kind === 'untouched' && (
          <>
            <label htmlFor="schedule-days" className="text-text-muted">
              After
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="schedule-days"
                type="number"
                min={0}
                max={365}
                value={days}
                onChange={(e) =>
                  setDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))
                }
                fieldSize="sm" className="w-20"
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
            <Select
              id="schedule-timer-preset"
              defaultValue={TIMER_PRESETS[0]!.id}
              onChange={(e) => {
                const p = TIMER_PRESETS.find((x) => x.id === e.target.value);
                if (p) {
                  setPhases(p.phases.map((ph) => ({ ...ph })));
                  setRounds(p.rounds);
                }
              }}
              fieldSize="sm"
            >
              {TIMER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <span className="text-text-muted">Phases</span>
            <div className="flex flex-col gap-1.5" data-testid="timer-phases">
              {phases.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    aria-label={`Phase ${i + 1} name`}
                    value={p.label}
                    onChange={(e) => setPhase(i, { label: e.target.value })}
                    fieldSize="sm" className={'w-32'}
                  />
                  <Input
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
                    fieldSize="sm" className={'w-20'}
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
              <Input
                id="schedule-rounds"
                type="number"
                min={0}
                max={99}
                value={rounds}
                onChange={(e) =>
                  setRounds(Math.max(0, Math.min(99, Number(e.target.value) || 0)))
                }
                fieldSize="sm" className="w-20"
              />
              <span className="text-text-muted">0 repeats until you stop it</span>
            </div>
            <label htmlFor="schedule-start-on" className="text-text-muted">
              Starts
            </label>
            <Select
              id="schedule-start-on"
              value={startOn}
              onChange={(e) => setStartOn(e.target.value as GardenEventName | '')}
              fieldSize="sm"
            >
              <option value="">When you press Start</option>
              {GARDEN_EVENTS.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  Itself, when {ev.label.charAt(0).toLowerCase() + ev.label.slice(1)}
                </option>
              ))}
            </Select>
          </>
        )}
        {kind === 'weather' && (
          <>
            <label htmlFor="schedule-weather" className="text-text-muted">
              Turns
            </label>
            <Select
              id="schedule-weather"
              value={condition}
              onChange={(e) => setCondition(e.target.value as WeatherKind | 'any')}
              fieldSize="sm"
            >
              {WEATHER_KINDS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.label}
                </option>
              ))}
            </Select>
            <span className="text-text-muted">Source</span>
            <WeatherSourceRow />
            <span className="text-text-muted">Place</span>
            <LocationRow />
          </>
        )}
        {kind === 'sun' && (
          <>
            <label htmlFor="schedule-sun" className="text-text-muted">
              Moment
            </label>
            <Select
              id="schedule-sun"
              value={sunPhase}
              onChange={(e) => setSunPhase(e.target.value as SunPhase)}
              fieldSize="sm"
            >
              {SUN_PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <span className="text-text-muted">Place</span>
            <LocationRow>
              <SunToday />
            </LocationRow>
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
                <Input
                  aria-label={`Alert note ${i + 1}`}
                  value={a.body ?? ''}
                  onChange={(e) => setAction(i, { ...a, body: e.target.value })}
                  placeholder="A note with the alert (optional)"
                  fieldSize="sm"
                />
              )}
              {a.kind === 'cue' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={`Cue ${i + 1}`}
                    value={typeof a.cue === 'string' ? a.cue : ''}
                    onChange={(e) => setAction(i, { ...a, cue: e.target.value })}
                    fieldSize="sm"
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
                  </Select>
                  <label className="flex items-center gap-1 text-text-muted">
                    <Input
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
                      fieldSize="sm" className="w-16"
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
                <Select
                  aria-label={`Mood ${i + 1}`}
                  value={a.moodId}
                  onChange={(e) => setAction(i, { ...a, moodId: e.target.value })}
                  fieldSize="sm"
                >
                  {moods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              )}
              {a.kind === 'prompt' && (
                <>
                  {cruxSelect(
                    `schedule-prompt-crux-${i}`,
                    a.cruxId,
                    (v) => setAction(i, { ...a, cruxId: v }),
                    '',
                  )}
                  <Textarea
                    aria-label={`Prompt ${i + 1}`}
                    value={a.prompt}
                    onChange={(e) => setAction(i, { ...a, prompt: e.target.value })}
                    placeholder="Summarise this week's changes into NOTES.md"
                    rows={2}
                    fieldSize="sm" className={'h-auto py-1.5'}
                  />
                </>
              )}
              {a.kind === 'fn' && (
                <>
                  {cruxSelect(
                    `schedule-fn-crux-${i}`,
                    a.cruxId,
                    (v) => setAction(i, { ...a, cruxId: v }),
                    '',
                  )}
                  <Input
                    aria-label={`Function ${i + 1}`}
                    value={a.name}
                    onChange={(e) => setAction(i, { ...a, name: e.target.value })}
                    placeholder="the handler's name — functions/<name>.js"
                    fieldSize="sm" className="font-mono"
                  />
                  <Textarea
                    aria-label={`Function input ${i + 1}`}
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
                        setError(`Function input ${i + 1} must be JSON.`);
                      }
                    }}
                    rows={2}
                    fieldSize="sm" className={'h-auto py-1.5 font-mono'}
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
                  <Select
                    aria-label={`Tool ${i + 1}`}
                    value={a.tool}
                    onChange={(e) => setAction(i, { ...a, tool: e.target.value })}
                    fieldSize="sm" className="font-mono"
                  >
                    {TOOL_NAMES().map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Select>
                  <Textarea
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
                    fieldSize="sm" className={'h-auto py-1.5 font-mono'}
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
  );
}
